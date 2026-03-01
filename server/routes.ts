import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { eq, and, desc, or, ilike, inArray, sql, gte, lte, not, isNull } from "drizzle-orm";
import {
  users,
  jobs,
  jobRuns,
  notifications,
  jobMessages,
  driverAvailability,
  monthlyInvoices,
  driverVehicles,
  jobAssignments,
  contractorProjects,
  reviews,
  contractorFavoriteDrivers,
  weightTickets,
} from "@shared/schema";
import bcrypt from "bcrypt";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { Resend } from "resend";
import crypto from "crypto";
import multer from "multer";

const resend = new Resend(process.env.RESEND_API_KEY);

const resetTokens = new Map<string, { email: string; expiresAt: number }>();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const pendingWeightTicketTimers = new Map<string, NodeJS.Timeout>();

function getJobDateRange(job: { scheduled_date: Date | null; estimated_days: string | null; listed_days?: string | null; includes_weekends: boolean | null }): string[] {
  if (!job.scheduled_date) return [];
  const startDate = new Date(job.scheduled_date);
  const rawDays = parseFloat(job.listed_days as string || job.estimated_days as string || '1') || 1;
  const days = Math.max(1, Math.ceil(rawDays));
  const dates: string[] = [];
  let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  let added = 0;
  while (added < days) {
    const dow = current.getUTCDay();
    if (job.includes_weekends || (dow !== 0 && dow !== 6)) {
      const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
      dates.push(key);
      added++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function getVehicleConflicts(
  vehicleId: string,
  jobDates: string[],
  _newJobIsFullDay: boolean,
  excludeJobId?: string
): Promise<{ date: string; jobMaterial: string; jobType: string; jobId: string }[]> {
  const existingAssignments = await db
    .select({
      job_id: jobAssignments.job_id,
      vehicle_id: jobAssignments.vehicle_id,
    })
    .from(jobAssignments)
    .where(
      and(
        eq(jobAssignments.vehicle_id, vehicleId),
        sql`${jobAssignments.status}::text IN ('accepted', 'approved', 'pending')`
      )
    );

  const conflicts: { date: string; jobMaterial: string; jobType: string; jobId: string }[] = [];
  for (const a of existingAssignments) {
    if (!a.job_id || a.job_id === excludeJobId) continue;
    const [existingJob] = await db.select().from(jobs).where(eq(jobs.id, a.job_id)).limit(1);
    if (!existingJob || existingJob.status === 'cancelled' || existingJob.status === 'completed') continue;

    const existingDates = getJobDateRange(existingJob);
    for (const d of existingDates) {
      if (jobDates.includes(d)) {
        conflicts.push({
          date: d,
          jobMaterial: existingJob.material || 'Unknown',
          jobType: existingJob.job_type || 'single_load',
          jobId: existingJob.id,
        });
      }
    }
  }
  return conflicts;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens) {
    if (data.expiresAt < now) resetTokens.delete(token);
  }
}, 60000);

const PgStore = pgSession(session);

export async function registerRoutes(app: Express): Promise<Server> {
  async function warmupDatabase(retries = 5, delay = 3000) {
    for (let i = 0; i < retries; i++) {
      try {
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
        console.log("Database connection established successfully");
        return true;
      } catch (err: any) {
        console.log(`Database warmup attempt ${i + 1}/${retries} failed: ${err.message}`);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    console.error("WARNING: Could not connect to database after all retries");
    return false;
  }

  await warmupDatabase();

  const pgStore = new PgStore({
    pool: pool,
    tableName: "sessions",
    createTableIfMissing: false,
    errorLog: (err: Error) => {
      console.error("Session store error:", err.message);
    },
  });

  const sessionMiddleware = session({
    store: pgStore,
    secret: process.env.SESSION_SECRET || "loadlink-mobile-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  });

  app.use((req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err) {
        console.error("Session middleware error:", err.message);
        if (err.message?.includes("endpoint has been disabled") || err.message?.includes("endpoint is disabled")) {
          return res.status(503).json({ message: "Database is starting up, please try again in a moment." });
        }
        return res.status(500).json({ message: "Server error, please try again." });
      }
      next();
    });
  });

  function requireAuth(req: Request, res: Response, next: Function) {
    if (!(req.session as any).userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  }

  // ============ AUTH ============

  async function dbRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const isNeonSleep = err?.message?.includes("endpoint has been disabled") || err?.message?.includes("endpoint is disabled");
        if (isNeonSleep && i < retries - 1) {
          console.log(`Database waking up, retrying in ${delay}ms (attempt ${i + 2}/${retries})...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Database unavailable after retries");
  }

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const [user] = await dbRetry(() => db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1));

      if (!user) {
        console.log("Login: No user found for email:", email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log("Login: Found user:", user.email, "login_provider:", user.login_provider, "has_password:", !!user.password);

      if (!user.password) {
        return res.status(401).json({ message: "This account uses a different login method. Please set a password on the web app first." });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        console.log("Login: Password mismatch for:", email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      (req.session as any).userId = user.id;

      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (err: any) {
      console.error("Login error:", err);
      const msg = err?.message?.includes("endpoint") ? "Database is waking up, please try again in a few seconds." : "Server error";
      return res.status(500).json({ message: msg });
    }
  });

  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "No account found with that email" });
      }

      if (user.password) {
        return res.status(409).json({ message: "Account already has a password. Use login instead." });
      }

      const hashed = await bcrypt.hash(password, 10);
      await db
        .update(users)
        .set({ password: hashed })
        .where(eq(users.id, user.id));

      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = { ...user, password: hashed };
      return res.json({ user: safeUser, message: "Password set successfully" });
    } catch (err) {
      console.error("Set password error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, phone, role } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({ message: "Email, password, and name required" });
      }

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      const hashed = await bcrypt.hash(password, 10);
      const names = fullName.split(" ");

      const [newUser] = await db
        .insert(users)
        .values({
          email,
          password: hashed,
          full_name: fullName,
          first_name: names[0] || "",
          last_name: names.slice(1).join(" ") || "",
          phone: phone || null,
          role: role || "driver",
          login_provider: "email_password",
        })
        .returning();

      (req.session as any).userId = newUser.id;

      const { password: _, ...safeUser } = newUser;
      return res.json({ user: safeUser });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const [user] = await dbRetry(() => db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1));

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (err: any) {
      console.error("Auth check error:", err);
      const msg = err?.message?.includes("endpoint") ? "Database is waking up, please try again in a few seconds." : "Server error";
      return res.status(500).json({ message: msg });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return res.json({ message: "If an account exists with that email, a reset link has been sent." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      resetTokens.set(token, { email, expiresAt: Date.now() + 30 * 60 * 1000 });

      const resetCode = token.substring(0, 6).toUpperCase();
      resetTokens.set(resetCode, { email, expiresAt: Date.now() + 30 * 60 * 1000 });

      const userName = user.full_name || user.first_name || "there";

      const emailResult = await resend.emails.send({
        from: "LoadLink <noreply@loadlinklive.com>",
        to: email,
        subject: "Reset Your LoadLink Password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #161a22; color: #ffffff; padding: 32px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #FF9900; font-size: 24px; margin: 0; letter-spacing: 2px;">LOADLINK</h1>
              <p style="color: #9ca3af; font-size: 13px; margin-top: 4px;">Built for Heavy Hauls</p>
            </div>
            <p style="color: #e5e7eb; font-size: 15px;">Hi ${userName},</p>
            <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">
              You requested a password reset for your LoadLink account. Use the code below in the app to set a new password:
            </p>
            <div style="background: #1e2330; border: 1px solid #2d3548; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; letter-spacing: 1px;">YOUR RESET CODE</p>
              <p style="color: #FF9900; font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 0;">${resetCode}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
              This code expires in 30 minutes. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      });

      console.log("Resend API response:", JSON.stringify(emailResult));
      
      if (emailResult.error) {
        console.error("Resend email error:", emailResult.error);
        return res.status(500).json({ message: "Failed to send reset email. Please try again." });
      }

      console.log("Password reset email sent to:", email, "code:", resetCode);
      return res.json({ message: "If an account exists with that email, a reset link has been sent." });
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ message: "Failed to send reset email. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { code, email, newPassword } = req.body;
      if (!code || !email || !newPassword) {
        return res.status(400).json({ message: "Code, email, and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const tokenData = resetTokens.get(code.toUpperCase());
      if (!tokenData || tokenData.email !== email || tokenData.expiresAt < Date.now()) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await db
        .update(users)
        .set({ password: hashed })
        .where(eq(users.email, email));

      resetTokens.delete(code.toUpperCase());

      return res.json({ message: "Password reset successfully. You can now sign in." });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ JOBS ============

  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { status, truck_type, search, driver_id, date } = req.query;

      const conditions = [];

      if (status && status !== "all") {
        if (status === "my_jobs" && driver_id) {
          conditions.push(eq(jobs.driver_id, driver_id as string));
          conditions.push(
            or(
              eq(jobs.status, "accepted"),
              eq(jobs.status, "in_progress"),
              eq(jobs.status, "pending")
            )!
          );
        } else if (status === "completed" && driver_id) {
          conditions.push(eq(jobs.driver_id, driver_id as string));
          conditions.push(eq(jobs.status, "completed"));
        } else {
          conditions.push(eq(jobs.status, status as any));
        }
      }

      if (truck_type && truck_type !== "all") {
        conditions.push(eq(jobs.truck_type, truck_type as any));
      }

      if (search) {
        const q = `%${search}%`;
        conditions.push(
          or(
            ilike(jobs.material, q),
            ilike(jobs.origin_address, q),
            ilike(jobs.destination_address, q)
          )!
        );
      }

      if (date) {
        const dayStart = new Date(date as string + "T00:00:00.000Z");
        const dayEnd = new Date(date as string + "T23:59:59.999Z");
        conditions.push(gte(jobs.scheduled_date, dayStart));
        conditions.push(lte(jobs.scheduled_date, dayEnd));
      }

      const result = await db
        .select({
          job: jobs,
          contractor_name: users.full_name,
          contractor_company: users.company,
          project_name: contractorProjects.name,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(jobs.created_at));

      const formattedJobs = result.map((r) => ({
        ...r.job,
        contractor_name: r.contractor_name || "Unknown",
        contractor_company: r.contractor_company || "Unknown Company",
        project_name: r.project_name || null,
      }));

      return res.json(formattedJobs);
    } catch (err) {
      console.error("Jobs fetch error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await db
        .select({
          job: jobs,
          contractor_name: users.full_name,
          contractor_company: users.company,
          contractor_phone: users.phone,
          contractor_email: users.email,
          project_name: contractorProjects.name,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(eq(jobs.id, id))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const r = result[0];
      const job: any = {
        ...r.job,
        contractor_name: r.contractor_name || "Unknown",
        contractor_company: r.contractor_company || "Unknown Company",
        contractor_phone: r.contractor_phone || "",
        contractor_email: r.contractor_email || "",
        project_name: r.project_name || null,
      };

      const runs = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.job_id, id))
        .orderBy(desc(jobRuns.started_at));

      const assignments = await db
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.job_id, id));

      const driverId = r.job.driver_id
        || assignments.find(a => a.status === 'approved')?.driver_id
        || runs[0]?.driver_id
        || null;

      if (driverId) {
        const [driverUser] = await db
          .select({ full_name: users.full_name, company: users.company })
          .from(users)
          .where(eq(users.id, driverId))
          .limit(1);
        if (driverUser) {
          job.driver_id = driverId;
          job.driver_name = driverUser.full_name;
          job.driver_company = driverUser.company;
        }
      }

      return res.json({ ...job, runs, assignments });
    } catch (err) {
      console.error("Job detail error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { vehicleIds } = req.body || {};

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "open") return res.status(400).json({ message: "Job is not available" });

      const vIds = Array.isArray(vehicleIds) ? vehicleIds : [];
      const jobDates = getJobDateRange(job);
      const newJobIsFullDay = job.job_type === 'full_day';

      if (vIds.length > 0 && jobDates.length > 0) {
        for (const vehicleId of vIds) {
          const conflicts = await getVehicleConflicts(vehicleId, jobDates, newJobIsFullDay, id);
          if (conflicts.length > 0) {
            const [v] = await db.select().from(driverVehicles).where(eq(driverVehicles.id, vehicleId)).limit(1);
            const truckLabel = v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : 'This truck';
            return res.status(409).json({
              message: `${truckLabel} is already booked for a full-day job on ${conflicts[0].date}. Remove it or pick a different truck.`,
              conflicts,
              vehicleId,
            });
          }
        }
      }

      if (jobDates.length > 0) {
        const driverTrucks = await db
          .select()
          .from(driverVehicles)
          .where(
            and(
              eq(driverVehicles.driver_id, userId),
              eq(driverVehicles.is_active, true),
              ...(job.truck_type ? [eq(driverVehicles.truck_type, job.truck_type)] : [])
            )
          );

        if (driverTrucks.length === 0 && vIds.length === 0) {
          const truckTypeName = job.truck_type ? job.truck_type.replace(/_/g, ' ') : 'any';
          return res.status(409).json({
            message: `You don't have any active ${truckTypeName} trucks in your fleet to accept this job.`,
          });
        }

        const qualifyingTruckIds = new Set(driverTrucks.map(t => t.id));

        const existingAssignmentsOnDates = await db
          .select({
            job_id: jobAssignments.job_id,
            vehicle_id: jobAssignments.vehicle_id,
          })
          .from(jobAssignments)
          .where(
            and(
              eq(jobAssignments.driver_id, userId),
              sql`${jobAssignments.status}::text IN ('accepted', 'approved', 'pending')`,
              sql`${jobAssignments.job_id} != ${id}`
            )
          );

        const bookedQualifyingByDate: Record<string, Set<string>> = {};
        for (const a of existingAssignmentsOnDates) {
          if (!a.job_id) continue;
          const [existingJob] = await db.select().from(jobs).where(eq(jobs.id, a.job_id)).limit(1);
          if (!existingJob || existingJob.status === 'cancelled' || existingJob.status === 'completed') continue;
          const eDates = getJobDateRange(existingJob);
          for (const d of eDates) {
            if (jobDates.includes(d)) {
              if (!bookedQualifyingByDate[d]) bookedQualifyingByDate[d] = new Set();
              if (a.vehicle_id && qualifyingTruckIds.has(a.vehicle_id)) {
                bookedQualifyingByDate[d].add(a.vehicle_id);
              } else if (!a.vehicle_id) {
                bookedQualifyingByDate[d].add(`no_vehicle_${a.job_id}`);
              }
            }
          }
        }

        for (const d of jobDates) {
          const bookedCount = bookedQualifyingByDate[d]?.size || 0;
          if (bookedCount >= driverTrucks.length) {
            const truckTypeName = job.truck_type ? job.truck_type.replace(/_/g, ' ') : '';
            const dateStr = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return res.status(409).json({
              message: `All ${driverTrucks.length} of your ${truckTypeName} truck${driverTrucks.length !== 1 ? 's are' : ' is'} already booked on ${dateStr}. You need an available ${truckTypeName} truck to accept this job.`,
            });
          }
        }
      }

      let isFavorite = false;
      try {
        if (job.contractor_id) {
          isFavorite = await db
            .select()
            .from(contractorFavoriteDrivers)
            .where(and(
              eq(contractorFavoriteDrivers.contractor_id, job.contractor_id),
              eq(contractorFavoriteDrivers.driver_id, userId)
            ))
            .limit(1)
            .then(r => r.length > 0);
        }
      } catch {}

      const assignmentStatus = isFavorite ? "approved" : "pending";

      if (isFavorite) {
        await db
          .update(jobs)
          .set({ driver_id: userId, status: "accepted", updated_at: new Date() })
          .where(eq(jobs.id, id));
      }

      if (vIds.length > 0) {
        for (const vehicleId of vIds) {
          await db.insert(jobAssignments).values({
            job_id: id,
            driver_id: userId,
            vehicle_id: vehicleId,
            status: assignmentStatus,
            ...(isFavorite ? { approved_at: new Date() } : {}),
          });
        }
      } else {
        await db.insert(jobAssignments).values({
          job_id: id,
          driver_id: userId,
          status: assignmentStatus,
          ...(isFavorite ? { approved_at: new Date() } : {}),
        });
      }

      const [driverUser] = await db.select({ full_name: users.full_name }).from(users).where(eq(users.id, userId)).limit(1);
      const driverName = driverUser?.full_name || 'A driver';

      await db.insert(notifications).values({
        user_id: job.contractor_id!,
        type: "load_accepted",
        title: isFavorite ? "Favorite Driver Assigned" : "New Driver Application",
        message: isFavorite
          ? `${driverName} (favorite) has been auto-assigned to your ${job.material} job`
          : `${driverName} would like to work on your ${job.material} job`,
        job_id: id,
      });

      return res.json({
        ok: true,
        isFavorite,
        assignmentStatus,
        message: isFavorite
          ? "You are assigned to this job! You're a favorite driver for this company."
          : "The company has been notified that you'd like to work on this job. You'll be notified when they respond.",
      });
    } catch (err) {
      console.error("Accept job error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const jobDates = getJobDateRange(job);
      const newJobIsFullDay = job.job_type === 'full_day';

      const userVehicles = await db
        .select()
        .from(driverVehicles)
        .where(eq(driverVehicles.driver_id, userId));

      const vehicleConflicts: Record<string, { blocked: boolean; wrongType: boolean; conflictDates: string[]; conflictJobs: string[] }> = {};
      for (const v of userVehicles) {
        const wrongType = !!job.truck_type && v.truck_type !== job.truck_type;
        if (wrongType) {
          vehicleConflicts[v.id] = { blocked: true, wrongType: true, conflictDates: [], conflictJobs: [] };
          continue;
        }
        if (jobDates.length === 0) {
          vehicleConflicts[v.id] = { blocked: false, wrongType: false, conflictDates: [], conflictJobs: [] };
          continue;
        }
        const conflicts = await getVehicleConflicts(v.id, jobDates, newJobIsFullDay, id);
        if (conflicts.length > 0) {
          const uniqueDates = [...new Set(conflicts.map(c => c.date))];
          const uniqueJobs = [...new Set(conflicts.map(c => c.jobMaterial))];
          vehicleConflicts[v.id] = { blocked: true, wrongType: false, conflictDates: uniqueDates, conflictJobs: uniqueJobs };
        } else {
          vehicleConflicts[v.id] = { blocked: false, wrongType: false, conflictDates: [], conflictJobs: [] };
        }
      }

      return res.json({
        jobType: job.job_type || 'single_load',
        requiredTruckType: job.truck_type || null,
        jobDates,
        vehicleConflicts,
      });
    } catch (err) {
      console.error("Vehicle conflicts error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/counter-bid", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { rate, note } = req.body;

      if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
        return res.status(400).json({ message: "Please enter a valid rate" });
      }

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "open") return res.status(400).json({ message: "Job is no longer available" });

      const existing = await db
        .select()
        .from(jobAssignments)
        .where(and(eq(jobAssignments.job_id, id), eq(jobAssignments.driver_id, userId)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(jobAssignments)
          .set({
            status: "counter_bid",
          })
          .where(eq(jobAssignments.id, existing[0].id));
      } else {
        await db.insert(jobAssignments).values({
          job_id: id,
          driver_id: userId,
          status: "counter_bid",
        });
      }

      await db.insert(notifications).values({
        user_id: job.contractor_id!,
        type: "counter_bid",
        title: "Counter Bid Received",
        message: `A driver submitted a counter bid of $${Number(rate).toFixed(2)} on your ${job.material} job`,
        job_id: id,
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("Counter bid error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      await db
        .delete(jobAssignments)
        .where(and(eq(jobAssignments.job_id, id), eq(jobAssignments.driver_id, userId)));

      await db
        .update(jobs)
        .set({ driver_id: null, status: "open", updated_at: new Date() })
        .where(and(eq(jobs.id, id), eq(jobs.driver_id, userId)));

      return res.json({ ok: true });
    } catch (err) {
      console.error("Withdraw error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/cleanup-duplicate-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const allAssignments = await db
        .select({
          id: jobAssignments.id,
          job_id: jobAssignments.job_id,
          vehicle_id: jobAssignments.vehicle_id,
          status: jobAssignments.status,
          created_at: jobAssignments.created_at,
        })
        .from(jobAssignments)
        .where(
          and(
            eq(jobAssignments.driver_id, userId),
            sql`${jobAssignments.status}::text IN ('accepted', 'approved', 'pending')`
          )
        )
        .orderBy(jobAssignments.created_at);

      const jobDatesMap: Record<string, { assignmentId: string; dates: string[]; createdAt: Date | null }[]> = {};

      for (const a of allAssignments) {
        if (!a.job_id) continue;
        const [job] = await db.select().from(jobs).where(eq(jobs.id, a.job_id)).limit(1);
        if (!job || job.status === 'cancelled' || job.status === 'completed') continue;

        const dates = getJobDateRange(job);
        for (const d of dates) {
          if (!jobDatesMap[d]) jobDatesMap[d] = [];
          jobDatesMap[d].push({ assignmentId: a.id, dates, createdAt: a.created_at });
        }
      }

      const userVehicles = await db
        .select()
        .from(driverVehicles)
        .where(and(eq(driverVehicles.driver_id, userId), eq(driverVehicles.is_active, true)));

      const fleetSize = userVehicles.length || 1;
      const assignmentsToRemove = new Set<string>();

      for (const [date, dateAssignments] of Object.entries(jobDatesMap)) {
        if (dateAssignments.length > fleetSize) {
          const sorted = dateAssignments.sort((a, b) =>
            (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0)
          );
          for (let i = fleetSize; i < sorted.length; i++) {
            assignmentsToRemove.add(sorted[i].assignmentId);
          }
        }
      }

      let removedCount = 0;
      for (const assignmentId of assignmentsToRemove) {
        const [removed] = await db
          .delete(jobAssignments)
          .where(eq(jobAssignments.id, assignmentId))
          .returning();
        if (removed) {
          removedCount++;
          if (removed.job_id) {
            const otherAssignments = await db
              .select()
              .from(jobAssignments)
              .where(eq(jobAssignments.job_id, removed.job_id))
              .limit(1);
            if (otherAssignments.length === 0) {
              await db
                .update(jobs)
                .set({ driver_id: null, status: "open", updated_at: new Date() })
                .where(eq(jobs.id, removed.job_id));
            }
          }
        }
      }

      return res.json({ ok: true, removedCount, message: `Removed ${removedCount} conflicting assignment(s)` });
    } catch (err) {
      console.error("Cleanup error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ JOB RUNS (Clock In/Out) ============

  app.post("/api/jobs/:id/clock-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { lat, lng } = req.body;

      const [run] = await db
        .insert(jobRuns)
        .values({
          job_id: id,
          driver_id: userId,
          status: "active",
          start_lat: lat?.toString(),
          start_lng: lng?.toString(),
        })
        .returning();

      await db
        .update(jobs)
        .set({ status: "in_progress", updated_at: new Date() })
        .where(eq(jobs.id, id));

      return res.json(run);
    } catch (err) {
      console.error("Clock in error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/job-runs/:runId/clock-out", requireAuth, async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { lat, lng, loads_hauled } = req.body;

      const [run] = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.id, runId))
        .limit(1);

      if (!run) return res.status(404).json({ message: "Run not found" });

      const startedAt = new Date(run.started_at!);
      const endedAt = new Date();
      const actualMinutes = Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 60000
      );
      const billedMinutes = Math.max(60, Math.ceil(actualMinutes / 15) * 15);

      const updateData: any = {
        status: "completed",
        ended_at: endedAt,
        end_lat: lat?.toString(),
        end_lng: lng?.toString(),
        actual_duration_minutes: actualMinutes,
        billed_duration_minutes: billedMinutes,
      };
      if (loads_hauled !== undefined && loads_hauled !== null) {
        updateData.loads_hauled = parseInt(loads_hauled);
      }

      const [updated] = await db
        .update(jobRuns)
        .set(updateData)
        .where(eq(jobRuns.id, runId))
        .returning();

      try {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, run.job_id!)).limit(1);
        if (job) {
          const driverId = run.driver_id;
          const contractorId = job.contractor_id;
          const [driverUser] = driverId ? await db.select({ full_name: users.full_name, company: users.company }).from(users).where(eq(users.id, driverId)).limit(1) : [null];
          const [contractorUser] = contractorId ? await db.select({ full_name: users.full_name, company: users.company }).from(users).where(eq(users.id, contractorId)).limit(1) : [null];

          if (driverId) {
            await db.insert(notifications).values({
              user_id: driverId,
              type: "load_completed",
              title: "Job Completed - Leave a Review",
              message: `How was your experience hauling ${job.material || 'materials'} for ${contractorUser?.company || contractorUser?.full_name || 'the contractor'}? Tap to leave a review.`,
              job_id: job.id,
            });
          }
          if (contractorId) {
            await db.insert(notifications).values({
              user_id: contractorId,
              type: "load_completed",
              title: "Job Completed - Leave a Review",
              message: `How was ${driverUser?.full_name || 'the driver'}'s work on your ${job.material || 'hauling'} job? Tap to leave a review.`,
              job_id: job.id,
            });
          }
        }
      } catch (notifErr) {
        console.error("Review notification error (non-fatal):", notifErr);
      }

      try {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, run.job_id!)).limit(1);
        if (job && job.requires_weight_tickets) {
          const timerKey = `${runId}`;
          if (pendingWeightTicketTimers.has(timerKey)) clearTimeout(pendingWeightTicketTimers.get(timerKey)!);
          const timer = setTimeout(async () => {
            try {
              const existing = await db.select().from(weightTickets).where(eq(weightTickets.job_run_id, runId));
              if (existing.length === 0) {
                const driverId = run.driver_id;
                const contractorId = job.contractor_id;
                const missingMsg = `Weight tickets have not been uploaded for the ${job.material || 'hauling'} job. Please upload them as soon as possible.`;
                if (driverId) {
                  await db.insert(notifications).values({
                    user_id: driverId,
                    type: "general",
                    title: "Missing Weight Tickets",
                    message: missingMsg,
                    job_id: job.id,
                  });
                }
                if (contractorId) {
                  await db.insert(notifications).values({
                    user_id: contractorId,
                    type: "general",
                    title: "Missing Weight Tickets",
                    message: `Driver has not uploaded weight tickets for the ${job.material || 'hauling'} job within 30 minutes of clock-out.`,
                    job_id: job.id,
                  });
                }
                if (job.trucking_company_id) {
                  await db.insert(notifications).values({
                    user_id: job.trucking_company_id,
                    type: "general",
                    title: "Missing Weight Tickets",
                    message: `Driver has not uploaded weight tickets for the ${job.material || 'hauling'} job within 30 minutes of clock-out.`,
                    job_id: job.id,
                  });
                }
              }
              pendingWeightTicketTimers.delete(timerKey);
            } catch (timerErr) {
              console.error("Weight ticket reminder error:", timerErr);
            }
          }, 30 * 60 * 1000);
          pendingWeightTicketTimers.set(timerKey, timer);
        }
      } catch (wtErr) {
        console.error("Weight ticket timer error (non-fatal):", wtErr);
      }

      return res.json(updated);
    } catch (err) {
      console.error("Clock out error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ WEIGHT TICKETS ============

  app.post("/api/job-runs/:runId/weight-tickets", requireAuth, upload.single('image'), async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = (req.session as any).userId;
      const { weight_value, notes, image_base64 } = req.body;

      const [run] = await db.select().from(jobRuns).where(eq(jobRuns.id, runId)).limit(1);
      if (!run) return res.status(404).json({ message: "Run not found" });

      let imageData: string | null = null;
      if (req.file) {
        imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      } else if (image_base64) {
        imageData = image_base64;
      }

      const [ticket] = await db.insert(weightTickets).values({
        job_run_id: runId,
        job_id: run.job_id,
        driver_id: userId,
        image_data: imageData,
        weight_value: weight_value || null,
        notes: notes || null,
      }).returning();

      if (pendingWeightTicketTimers.has(runId)) {
        clearTimeout(pendingWeightTicketTimers.get(runId)!);
        pendingWeightTicketTimers.delete(runId);
      }

      return res.json(ticket);
    } catch (err) {
      console.error("Weight ticket upload error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tickets = await db.select().from(weightTickets)
        .where(eq(weightTickets.job_id, jobId))
        .orderBy(desc(weightTickets.created_at));
      return res.json(tickets);
    } catch (err) {
      console.error("Get weight tickets error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const tickets = await db.select().from(weightTickets)
        .where(eq(weightTickets.job_run_id, runId))
        .orderBy(desc(weightTickets.created_at));
      return res.json(tickets);
    } catch (err) {
      console.error("Get weight tickets error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ MESSAGES ============

  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const myJobs = await db
        .select({ id: jobs.id, material: jobs.material, contractor_id: jobs.contractor_id })
        .from(jobs)
        .where(
          or(
            eq(jobs.driver_id, userId),
            eq(jobs.contractor_id, userId)
          )
        );

      if (myJobs.length === 0) return res.json([]);

      const jobIds = myJobs.map((j) => j.id);

      const messages = await db
        .select()
        .from(jobMessages)
        .where(inArray(jobMessages.job_id, jobIds))
        .orderBy(desc(jobMessages.created_at));

      const convMap = new Map<string, any>();
      for (const msg of messages) {
        if (!convMap.has(msg.job_id)) {
          const job = myJobs.find((j) => j.id === msg.job_id);
          const otherUserId =
            job?.contractor_id === userId ? msg.sender_id : job?.contractor_id;

          let otherUser = null;
          if (otherUserId) {
            const [u] = await db
              .select({ full_name: users.full_name, company: users.company })
              .from(users)
              .where(eq(users.id, otherUserId))
              .limit(1);
            otherUser = u;
          }

          convMap.set(msg.job_id, {
            id: `conv_${msg.job_id}`,
            jobId: msg.job_id,
            jobMaterial: job?.material || "Unknown",
            contractorName: otherUser?.full_name || "Unknown",
            contractorCompany: otherUser?.company || "Unknown",
            lastMessage: msg.body,
            lastMessageAt: msg.created_at,
            unreadCount: 0,
          });
        }

        if (!msg.read && msg.sender_id !== userId) {
          convMap.get(msg.job_id)!.unreadCount++;
        }
      }

      return res.json(Array.from(convMap.values()));
    } catch (err) {
      console.error("Conversations error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const msgs = await db
        .select({
          message: jobMessages,
          sender_name: users.full_name,
        })
        .from(jobMessages)
        .leftJoin(users, eq(jobMessages.sender_id, users.id))
        .where(eq(jobMessages.job_id, jobId))
        .orderBy(jobMessages.created_at);

      const result = msgs.map((m) => ({
        ...m.message,
        sender_name: m.sender_name || "Unknown",
      }));

      return res.json(result);
    } catch (err) {
      console.error("Messages error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { jobId } = req.params;
      const { body } = req.body;

      const [msg] = await db
        .insert(jobMessages)
        .values({
          job_id: jobId,
          sender_id: userId,
          body,
        })
        .returning();

      const [sender] = await db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return res.json({
        ...msg,
        sender_name: sender?.full_name || "Unknown",
      });
    } catch (err) {
      console.error("Send message error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ NOTIFICATIONS ============

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .orderBy(desc(notifications.created_at))
        .limit(50);

      return res.json(notifs);
    } catch (err) {
      console.error("Notifications error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      await db
        .update(notifications)
        .set({ is_read: true })
        .where(eq(notifications.user_id, userId));

      return res.json({ ok: true });
    } catch (err) {
      console.error("Mark read error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ DASHBOARD ============

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      if (!user) return res.status(404).json({ message: "User not found" });

      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const completedJobs = await db
        .select({ job: jobs })
        .from(jobs)
        .where(and(eq(jobs.driver_id, userId), eq(jobs.status, "completed")));

      const runs = await db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.driver_id, userId), eq(jobRuns.status, "completed")));

      function calcEarning(j: any) {
        const jobRun = runs.find(r => r.job_id === j.id);
        const billedHours = jobRun ? (jobRun.billed_duration_minutes || 0) / 60 : 0;
        const rate = Number(j.rate) || 0;
        if (j.rate_type === "per_hour") return billedHours * rate;
        if (j.rate_type === "flat_rate") return rate;
        return Number(j.estimated_cost) || rate;
      }

      const totalEarnings = completedJobs.reduce((sum, r) => sum + calcEarning(r.job), 0);
      const pendingJobs = completedJobs.filter(r => r.job.payment_status !== "payment_received");
      const awaitingPayment = pendingJobs.reduce((sum, r) => sum + calcEarning(r.job), 0);
      const monthJobs = completedJobs.filter(r => {
        const d = r.job.completed_date || r.job.scheduled_date;
        return d && new Date(d) >= monthStart;
      });
      const thisMonthEarnings = monthJobs.reduce((sum, r) => sum + calcEarning(r.job), 0);
      const weekJobs = completedJobs.filter(r => {
        const d = r.job.completed_date || r.job.scheduled_date;
        return d && new Date(d) >= weekAgo;
      });
      const thisWeekEarnings = weekJobs.reduce((sum, r) => sum + calcEarning(r.job), 0);

      const activeJobsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.driver_id, userId), or(eq(jobs.status, "accepted"), eq(jobs.status, "in_progress"))))
        .then(r => Number(r[0]?.count) || 0);

      const nearbyOpenJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, "open"))
        .limit(1);

      const upcoming5Days: any[] = [];
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const isContractorUser = user.role?.includes('contractor');

      for (let i = 0; i < 5; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = new Date(dateStr + 'T00:00:00.000Z');
        const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

        if (isContractorUser) {
          const dayJobs = await db
            .select({
              id: jobs.id,
              material: jobs.material,
              trucks_needed: jobs.trucks_needed,
              status: jobs.status,
              project_name: contractorProjects.name,
            })
            .from(jobs)
            .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
            .where(and(
              eq(jobs.contractor_id, userId),
              gte(jobs.scheduled_date, dayStart),
              lte(jobs.scheduled_date, dayEnd),
              or(
                eq(jobs.status, 'open' as any),
                eq(jobs.status, 'pending' as any),
                eq(jobs.status, 'accepted' as any),
                eq(jobs.status, 'in_progress' as any)
              )!
            ));

          const jobIds = dayJobs.map(j => j.id);
          let appliedCount: Record<string, number> = {};
          let assignedCount: Record<string, number> = {};
          let assignedVehicles: Record<string, any[]> = {};
          if (jobIds.length > 0) {
            const assigns = await db
              .select({
                job_id: jobAssignments.job_id,
                status: jobAssignments.status,
                vehicle_id: jobAssignments.vehicle_id,
                vehicle_make: driverVehicles.make,
                vehicle_model: driverVehicles.model,
                vehicle_year: driverVehicles.year,
                vehicle_plate: driverVehicles.license_plate,
                driver_name: users.full_name,
              })
              .from(jobAssignments)
              .leftJoin(driverVehicles, eq(jobAssignments.vehicle_id, driverVehicles.id))
              .leftJoin(users, eq(jobAssignments.driver_id, users.id))
              .where(inArray(jobAssignments.job_id, jobIds));
            for (const a of assigns) {
              if (a.job_id) {
                appliedCount[a.job_id] = (appliedCount[a.job_id] || 0) + 1;
                if (a.status === 'accepted' || a.status === 'approved') {
                  assignedCount[a.job_id] = (assignedCount[a.job_id] || 0) + 1;
                  if (a.vehicle_id) {
                    if (!assignedVehicles[a.job_id]) assignedVehicles[a.job_id] = [];
                    assignedVehicles[a.job_id].push({
                      make: a.vehicle_make,
                      model: a.vehicle_model,
                      year: a.vehicle_year,
                      plate: a.vehicle_plate,
                      driverName: a.driver_name,
                    });
                  }
                }
              }
            }
          }

          upcoming5Days.push({
            date: dateStr,
            dayName: dayNames[d.getDay()],
            dayNum: d.getDate(),
            status: dayJobs.length > 0 ? 'has_jobs' : 'available',
            jobs: dayJobs.map(j => ({
              id: j.id,
              material: j.material || 'Unknown',
              projectName: j.project_name || '',
              trucksNeeded: j.trucks_needed || 1,
              applied: appliedCount[j.id] || 0,
              assigned: assignedCount[j.id] || 0,
              assignedVehicles: assignedVehicles[j.id] || [],
              status: j.status || 'open',
            })),
          });
        } else {
          const avail = await db
            .select()
            .from(driverAvailability)
            .where(and(
              eq(driverAvailability.driver_id, userId),
              eq(driverAvailability.date, d)
            ))
            .then(r => r[0]);

          const driverDayAssignments = await db
            .select({
              job_id: jobAssignments.job_id,
              status: jobAssignments.status,
              vehicle_id: jobAssignments.vehicle_id,
            })
            .from(jobAssignments)
            .innerJoin(jobs, eq(jobAssignments.job_id, jobs.id))
            .where(and(
              eq(jobAssignments.driver_id, userId),
              sql`${jobAssignments.status}::text IN ('accepted', 'approved', 'pending')`,
              gte(jobs.scheduled_date, dayStart),
              lte(jobs.scheduled_date, dayEnd)
            ));

          let driverDayJobs: any[] = [];
          if (driverDayAssignments.length > 0) {
            const assignedJobIds = driverDayAssignments.map(a => a.job_id!);
            const jobsData = await db
              .select({
                id: jobs.id,
                material: jobs.material,
                status: jobs.status,
                trucks_needed: jobs.trucks_needed,
                project_name: contractorProjects.name,
                contractor_name: users.full_name,
              })
              .from(jobs)
              .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
              .leftJoin(users, eq(jobs.contractor_id, users.id))
              .where(inArray(jobs.id, assignedJobIds));

            driverDayJobs = jobsData.map(j => {
              const assignment = driverDayAssignments.find(a => a.job_id === j.id);
              return {
                id: j.id,
                material: j.material || 'Unknown',
                projectName: j.project_name || '',
                contractorName: j.contractor_name || '',
                trucksNeeded: j.trucks_needed || 1,
                status: j.status || 'open',
                assignmentStatus: assignment?.status || 'pending',
                vehicleId: assignment?.vehicle_id || null,
              };
            });
          }

          upcoming5Days.push({
            date: dateStr,
            dayName: dayNames[d.getDay()],
            dayNum: d.getDate(),
            status: driverDayJobs.length > 0 ? 'has_jobs' : (avail?.status || 'available'),
            jobs: driverDayJobs.length > 0 ? driverDayJobs : undefined,
          });
        }
      }

      const recentActivity = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .orderBy(desc(notifications.created_at))
        .limit(5);

      let activeRun: any = null;
      const activeRunRows = await db.execute(sql`
        SELECT jr.id as "runId", jr.job_id as "jobId", jr.started_at as "clockInTime",
               j.material, j.origin_address as "originAddress",
               u.full_name as "contractorName"
        FROM job_runs jr
        INNER JOIN jobs j ON jr.job_id = j.id
        LEFT JOIN users u ON j.contractor_id = u.id
        WHERE jr.driver_id = ${userId}
          AND jr.status = 'active'
          AND jr.ended_at IS NULL
        LIMIT 1
      `);
      if (activeRunRows.rows && activeRunRows.rows.length > 0) {
        const r = activeRunRows.rows[0] as any;
        activeRun = {
          runId: r.runId,
          jobId: r.jobId,
          clockInTime: r.clockInTime,
          material: r.material,
          originAddress: r.originAddress,
          contractorName: r.contractorName,
        };
      }

      return res.json({
        userName: user.full_name,
        role: user.role,
        activeJobs: activeJobsCount,
        isConnected: user.is_connected,
        activeRun,
        quickJob: nearbyOpenJobs.length > 0 ? {
          material: nearbyOpenJobs[0].material,
          address: nearbyOpenJobs[0].origin_address,
        } : null,
        earnings: {
          total: totalEarnings,
          awaiting: awaitingPayment,
          thisMonth: thisMonthEarnings,
          thisWeek: thisWeekEarnings,
        },
        location: {
          lat: user.primary_location_lat ? Number(user.primary_location_lat) : null,
          lng: user.primary_location_lng ? Number(user.primary_location_lng) : null,
          address: user.primary_location_address,
        },
        upcomingDays: upcoming5Days,
        recentActivity: recentActivity.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          createdAt: n.created_at,
          isRead: n.is_read,
        })),
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ EARNINGS ============

  // ============ DASHBOARD ============

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ message: "User not found" });

      const activeJobsList = await db
        .select()
        .from(jobs)
        .where(
          and(
            or(eq(jobs.driver_id, userId), eq(jobs.contractor_id, userId)),
            or(eq(jobs.status, "accepted"), eq(jobs.status, "in_progress"))
          )
        );

      const quickJobResult = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, "open"))
        .orderBy(desc(jobs.created_at))
        .limit(1);
      const quickJob = quickJobResult.length > 0
        ? { material: quickJobResult[0].material || "General", address: quickJobResult[0].delivery_address || quickJobResult[0].pickup_address || "See details" }
        : null;

      const completedJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.driver_id, userId), eq(jobs.status, "completed")));

      const completedRuns = await db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.driver_id, userId), eq(jobRuns.status, "completed")));

      let totalEarnings = 0;
      let awaitingPayment = 0;
      let thisMonthEarnings = 0;
      let thisWeekEarnings = 0;
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const j of completedJobs) {
        const run = completedRuns.find(r => r.job_id === j.id);
        const billedHours = run ? (run.billed_duration_minutes || 0) / 60 : 0;
        const rate = Number(j.rate) || 0;
        let amount = 0;
        if (j.rate_type === "per_hour") amount = billedHours * rate;
        else if (j.rate_type === "flat_rate") amount = rate;
        else amount = rate;
        if (amount === 0) amount = Number(j.estimated_cost) || rate;
        totalEarnings += amount;

        const completedDate = j.completed_date ? new Date(j.completed_date) : null;
        if (completedDate) {
          if (completedDate >= monthStart) thisMonthEarnings += amount;
          if (completedDate >= weekAgo) thisWeekEarnings += amount;
        }
      }

      const pendingInvoices = await db
        .select()
        .from(monthlyInvoices)
        .where(and(eq(monthlyInvoices.driver_id, userId), eq(monthlyInvoices.status, "pending")));
      for (const inv of pendingInvoices) {
        awaitingPayment += Number(inv.total_amount) || 0;
      }

      const upcomingDays: { date: string; dayName: string; dayNum: number; status: string }[] = [];
      const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      for (let i = 0; i < 5; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const avail = await db
          .select()
          .from(driverAvailability)
          .where(and(eq(driverAvailability.driver_id, userId), eq(driverAvailability.date, dateStr)))
          .limit(1);
        upcomingDays.push({
          date: dateStr,
          dayName: dayNames[d.getDay()],
          dayNum: d.getDate(),
          status: avail.length > 0 ? avail[0].status : "available",
        });
      }

      const recentNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .orderBy(desc(notifications.created_at))
        .limit(5);

      const recentActivity = recentNotifs.map(n => ({
        id: String(n.id),
        type: n.type,
        title: n.title,
        message: n.message || "",
        createdAt: n.created_at ? n.created_at.toISOString() : new Date().toISOString(),
        isRead: n.is_read,
      }));

      let activeRun: any = null;
      const activeRunRows = await db.execute(sql`
        SELECT jr.id as "runId", jr.job_id as "jobId", jr.started_at as "clockInTime",
               j.material, j.origin_address as "originAddress",
               u.full_name as "contractorName"
        FROM job_runs jr
        INNER JOIN jobs j ON jr.job_id = j.id
        LEFT JOIN users u ON j.contractor_id = u.id
        WHERE jr.driver_id = ${userId}
          AND jr.status = 'active'
          AND jr.ended_at IS NULL
        LIMIT 1
      `);
      if (activeRunRows.rows && activeRunRows.rows.length > 0) {
        const r = activeRunRows.rows[0] as any;
        activeRun = {
          runId: r.runId,
          jobId: r.jobId,
          clockInTime: r.clockInTime,
          material: r.material,
          originAddress: r.originAddress,
          contractorName: r.contractorName,
        };
      }

      res.json({
        userName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
        role: user.role,
        activeJobs: activeJobsList.length,
        isConnected: user.is_connected,
        activeRun,
        quickJob,
        earnings: {
          total: totalEarnings,
          awaiting: awaitingPayment,
          thisMonth: thisMonthEarnings,
          thisWeek: thisWeekEarnings,
        },
        location: {
          lat: user.last_latitude ? Number(user.last_latitude) : null,
          lng: user.last_longitude ? Number(user.last_longitude) : null,
          address: user.address || null,
        },
        upcomingDays,
        recentActivity,
      });
    } catch (error: any) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  // ============ EARNINGS ============

  app.get("/api/earnings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { period } = req.query;

      let dateFilter: Date | null = null;
      if (period === "week") {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (period === "month") {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      }

      let conditions: any[] = [
        eq(jobs.driver_id, userId),
        eq(jobs.status, "completed"),
      ];

      if (dateFilter) {
        conditions.push(gte(jobs.completed_date, dateFilter));
      }

      const completedJobs = await db
        .select({
          job: jobs,
          contractor_company: users.company,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(jobs.completed_date));

      const runs = await db
        .select()
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.driver_id, userId),
            eq(jobRuns.status, "completed")
          )
        );

      const earnings = completedJobs.map((r) => {
        const jobRun = runs.find((run) => run.job_id === r.job.id);
        const billedHours = jobRun
          ? (jobRun.billed_duration_minutes || 0) / 60
          : 0;
        const rate = Number(r.job.rate) || 0;
        let amount = 0;

        if (r.job.rate_type === "per_hour") {
          amount = billedHours * rate;
        } else if (r.job.rate_type === "flat_rate") {
          amount = rate;
        } else if (r.job.rate_type === "per_load" || r.job.rate_type === "per_ton") {
          amount = rate;
        }

        if (amount === 0) amount = Number(r.job.estimated_cost) || rate;

        return {
          id: r.job.id,
          jobId: r.job.id,
          material: r.job.material,
          contractorCompany: r.contractor_company || "Unknown",
          date: r.job.completed_date || r.job.scheduled_date,
          billedHours,
          rate,
          rateType: r.job.rate_type,
          amount,
          status: r.job.payment_status === "payment_received" ? "paid" as const : "pending" as const,
        };
      });

      const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
      const totalJobs = earnings.length;
      const pendingAmount = earnings
        .filter((e) => e.status === "pending")
        .reduce((sum, e) => sum + e.amount, 0);

      return res.json({
        earnings,
        stats: {
          totalEarnings,
          totalJobs,
          pendingAmount,
          paidAmount: totalEarnings - pendingAmount,
        },
      });
    } catch (err) {
      console.error("Earnings error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ CALENDAR / AVAILABILITY ============

  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { month, year } = req.query;

      let conditions: any[] = [eq(driverAvailability.driver_id, userId)];

      if (month && year) {
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 0);
        conditions.push(gte(driverAvailability.date, startDate));
        conditions.push(lte(driverAvailability.date, endDate));
      }

      const avail = await db
        .select()
        .from(driverAvailability)
        .where(and(...conditions))
        .orderBy(driverAvailability.date);

      return res.json(avail);
    } catch (err) {
      console.error("Availability error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { date, isAvailable, startTime, endTime, notes, shift, recurrence, remove } = req.body;

      const dateObj = new Date(date);
      const existing = await db
        .select()
        .from(driverAvailability)
        .where(
          and(
            eq(driverAvailability.driver_id, userId),
            eq(driverAvailability.date, dateObj)
          )
        )
        .limit(1);

      if (remove && existing.length > 0) {
        await db
          .delete(driverAvailability)
          .where(eq(driverAvailability.id, existing[0].id));
        return res.json({ removed: true });
      }

      const dayOfWeek = dateObj.getDay();

      if (existing.length > 0) {
        const [updated] = await db
          .update(driverAvailability)
          .set({
            is_available: isAvailable ?? true,
            start_time: startTime || "06:00",
            end_time: endTime || "18:00",
            notes: notes || null,
            recurrence: recurrence || "none",
            day_of_week: recurrence === "weekly" ? dayOfWeek : null,
            updated_at: new Date(),
          })
          .where(eq(driverAvailability.id, existing[0].id))
          .returning();
        return res.json(updated);
      } else {
        const [created] = await db
          .insert(driverAvailability)
          .values({
            driver_id: userId,
            date: dateObj,
            is_available: isAvailable ?? true,
            start_time: startTime || "06:00",
            end_time: endTime || "18:00",
            notes: notes || null,
            recurrence: recurrence || "none",
            day_of_week: recurrence === "weekly" ? dayOfWeek : null,
          })
          .returning();
        return res.json(created);
      }
    } catch (err) {
      console.error("Set availability error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ PROFILE ============

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return res.status(404).json({ message: "User not found" });

      const vehicles = await db
        .select()
        .from(driverVehicles)
        .where(eq(driverVehicles.driver_id, userId));

      const { password: _, ...safeUser } = user;
      return res.json({ ...safeUser, vehicles });
    } catch (err) {
      console.error("Profile error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const updates = req.body;

      delete updates.id;
      delete updates.password;

      updates.updated_at = new Date();

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      console.error("Update profile error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/profile/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { isConnected } = req.body;

      await db
        .update(users)
        .set({
          is_connected: isConnected,
          last_seen_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));

      return res.json({ ok: true });
    } catch (err) {
      console.error("Status update error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ ROLE SWITCHING ============

  app.put("/api/profile/role", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { role } = req.body;

      const validRoles = ["driver", "contractor", "trucking_company", "trucking_company_contractor", "driver_contractor", "foreman", "driver_trucking_company"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const [updated] = await db
        .update(users)
        .set({ role, updated_at: new Date() })
        .where(eq(users.id, userId))
        .returning();

      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      console.error("Role switch error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ VEHICLES ============

  app.get("/api/drivers/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string || '').trim();
      if (q.length < 2) return res.json([]);
      const pattern = `%${q}%`;
      const results = await db.execute(
        sql`SELECT id, full_name as name, email, company, role FROM users
            WHERE (full_name ILIKE ${pattern} OR email ILIKE ${pattern} OR company ILIKE ${pattern})
            AND (role ILIKE '%driver%' OR role ILIKE '%trucking%')
            LIMIT 10`
      );
      return res.json(results.rows || results);
    } catch (err) {
      console.error("Driver search error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { vehicleId } = req.params;

      const vehicle = await db.select().from(driverVehicles).where(eq(driverVehicles.id, vehicleId)).limit(1);
      if (!vehicle.length || vehicle[0].driver_id !== userId) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const assignments = await db
        .select({
          assignment: jobAssignments,
          job: jobs,
          contractor: {
            id: users.id,
            name: users.full_name,
            company: users.company,
          },
        })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.job_id, jobs.id))
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .where(
          and(
            eq(jobAssignments.vehicle_id, vehicleId),
            eq(jobAssignments.driver_id, userId),
            inArray(jobAssignments.status, ['approved', 'pending'])
          )
        );

      const result = assignments.map((a) => ({
        ...a.job,
        assignment_status: a.assignment.status,
        contractor_name: a.contractor?.company || a.contractor?.name || 'Unknown',
      }));

      return res.json({ vehicle: vehicle[0], jobs: result });
    } catch (err) {
      console.error("Vehicle jobs error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const vehicles = await db
        .select()
        .from(driverVehicles)
        .where(eq(driverVehicles.driver_id, userId));

      const enriched = await Promise.all(vehicles.map(async (v) => {
        if (v.assigned_driver_id) {
          const [driver] = await db
            .select({ id: users.id, name: users.full_name, email: users.email })
            .from(users)
            .where(eq(users.id, v.assigned_driver_id))
            .limit(1);
          return { ...v, assigned_driver: driver || null };
        }
        return { ...v, assigned_driver: null };
      }));

      return res.json(enriched);
    } catch (err) {
      console.error("Vehicles error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ CONTRACTOR JOB MANAGEMENT ============

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const {
        material, origin_address, destination_address, origin_lat, origin_lng,
        destination_lat, destination_lng, distance, rate, rate_type, truck_type,
        scheduled_date, pickup_time, urgent, capacity_needed, total_tons_needed,
        trucks_needed, job_type, estimated_duration_minutes, load_time_minutes,
        unload_time_minutes, requires_tarp, requires_weight_tickets,
        total_amount_unit, estimated_cost, estimated_trips, estimated_days,
        includes_weekends, project_id,
      } = req.body;

      const [job] = await db
        .insert(jobs)
        .values({
          contractor_id: userId,
          material,
          origin_address,
          destination_address,
          origin_lat,
          origin_lng,
          destination_lat,
          destination_lng,
          distance,
          rate,
          rate_type,
          truck_type,
          scheduled_date: scheduled_date ? new Date(scheduled_date + 'T12:00:00Z') : null,
          pickup_time,
          urgent: urgent ?? false,
          capacity_needed,
          total_tons_needed,
          trucks_needed,
          job_type,
          estimated_duration_minutes,
          load_time_minutes,
          unload_time_minutes,
          requires_tarp: requires_tarp ?? false,
          requires_weight_tickets: requires_weight_tickets ?? false,
          total_amount_unit,
          estimated_cost,
          estimated_trips,
          estimated_days,
          includes_weekends: includes_weekends ?? false,
          project_id,
          status: "open",
        })
        .returning();

      return res.json(job);
    } catch (err) {
      console.error("Create job error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.contractor_id !== userId) return res.status(403).json({ message: "Not authorized" });

      const updates = { ...req.body };
      delete updates.id;
      delete updates.contractor_id;
      updates.updated_at = new Date();
      if (updates.scheduled_date) {
        const dateStr = String(updates.scheduled_date).substring(0, 10);
        updates.scheduled_date = new Date(dateStr + 'T12:00:00Z');
      }

      const [updated] = await db
        .update(jobs)
        .set(updates)
        .where(eq(jobs.id, id))
        .returning();

      return res.json(updated);
    } catch (err) {
      console.error("Update job error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.contractor_id !== userId) return res.status(403).json({ message: "Not authorized" });

      await db
        .update(jobs)
        .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
        .where(eq(jobs.id, id));

      return res.json({ ok: true });
    } catch (err) {
      console.error("Cancel job error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/contractor/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { date, status, search, project_id } = req.query;

      const conditions: any[] = [eq(jobs.contractor_id, userId)];

      if (project_id) {
        conditions.push(eq(jobs.project_id, project_id as string));
      }

      if (date) {
        const dayStart = new Date(date as string + "T00:00:00.000Z");
        const dayEnd = new Date(date as string + "T23:59:59.999Z");
        conditions.push(gte(jobs.scheduled_date, dayStart));
        conditions.push(lte(jobs.scheduled_date, dayEnd));
      }

      if (status && status !== "all") {
        if (status === "completed") {
          conditions.push(or(eq(jobs.status, "completed" as any), eq(jobs.status, "cancelled" as any))!);
        } else if (status === "open") {
          conditions.push(eq(jobs.status, "open" as any));
        } else {
          conditions.push(eq(jobs.status, status as any));
        }
      } else if (!status || status === "all") {
        conditions.push(not(eq(jobs.status, "cancelled" as any)));
      }

      if (search) {
        const q = `%${search}%`;
        conditions.push(
          or(
            ilike(jobs.material, q),
            ilike(jobs.origin_address, q),
            ilike(jobs.destination_address, q)
          )!
        );
      }

      const result = await db
        .select({
          job: jobs,
          driver_name: users.full_name,
          driver_company: users.company,
          driver_phone: users.phone,
          project_name: contractorProjects.name,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.driver_id, users.id))
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(and(...conditions))
        .orderBy(desc(jobs.created_at));

      const jobIds = result.map(r => r.job.id);
      let assignmentsByJob: Record<string, any[]> = {};
      if (jobIds.length > 0) {
        const allAssignments = await db
          .select({
            assignment: jobAssignments,
            vehicle_make: driverVehicles.make,
            vehicle_model: driverVehicles.model,
            vehicle_year: driverVehicles.year,
            vehicle_plate: driverVehicles.license_plate,
            vehicle_truck_type: driverVehicles.truck_type,
            vehicle_truck_number: driverVehicles.truck_number,
            driver_name: users.full_name,
          })
          .from(jobAssignments)
          .leftJoin(driverVehicles, eq(jobAssignments.vehicle_id, driverVehicles.id))
          .leftJoin(users, eq(jobAssignments.driver_id, users.id))
          .where(inArray(jobAssignments.job_id, jobIds));

        for (const a of allAssignments) {
          const jid = a.assignment.job_id!;
          if (!assignmentsByJob[jid]) assignmentsByJob[jid] = [];
          assignmentsByJob[jid].push({
            id: a.assignment.id,
            status: a.assignment.status,
            driverName: a.driver_name || 'Unknown',
            vehicle: a.assignment.vehicle_id ? {
              make: a.vehicle_make,
              model: a.vehicle_model,
              year: a.vehicle_year,
              licensePlate: a.vehicle_plate,
              truckType: a.vehicle_truck_type,
              truckNumber: a.vehicle_truck_number,
            } : null,
          });
        }
      }

      const formattedJobs = result.map((r) => ({
        ...r.job,
        driver_name: r.driver_name || null,
        driver_company: r.driver_company || null,
        driver_phone: r.driver_phone || null,
        project_name: r.project_name || null,
        assignments: assignmentsByJob[r.job.id] || [],
        trucksAssigned: (assignmentsByJob[r.job.id] || []).filter((a: any) => a.status === 'accepted' || a.status === 'approved').length,
      }));

      return res.json(formattedJobs);
    } catch (err) {
      console.error("Contractor jobs error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/contractor/calendar-capacity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { month, year } = req.query;
      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      const m = parseInt(month as string);
      const y = parseInt(year as string);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

      const [userData] = await db
        .select({ fleet_size: users.fleet_size })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const fleetSize = userData?.fleet_size || 0;

      const lookbackStart = new Date(Date.UTC(y, m - 2, 1));

      const contractorJobs = await db
        .select({
          id: jobs.id,
          scheduled_date: jobs.scheduled_date,
          trucks_needed: jobs.trucks_needed,
          status: jobs.status,
          material: jobs.material,
          origin_address: jobs.origin_address,
          destination_address: jobs.destination_address,
          project_name: contractorProjects.name,
          estimated_days: jobs.estimated_days,
          includes_weekends: jobs.includes_weekends,
          job_type: jobs.job_type,
          listed_days: jobs.listed_days,
        })
        .from(jobs)
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(
          and(
            eq(jobs.contractor_id, userId),
            gte(jobs.scheduled_date, lookbackStart),
            lte(jobs.scheduled_date, monthEnd),
            or(
              eq(jobs.status, 'open' as any),
              eq(jobs.status, 'pending' as any),
              eq(jobs.status, 'accepted' as any),
              eq(jobs.status, 'in_progress' as any),
              eq(jobs.status, 'completed' as any)
            )!
          )
        );

      const jobIds = contractorJobs.map(j => j.id);
      let approvedByJob: Record<string, number> = {};
      let appliedByJob: Record<string, number> = {};
      let vehiclesByJob: Record<string, any[]> = {};
      if (jobIds.length > 0) {
        const assignments = await db
          .select({
            job_id: jobAssignments.job_id,
            status: jobAssignments.status,
            vehicle_id: jobAssignments.vehicle_id,
            vehicle_make: driverVehicles.make,
            vehicle_model: driverVehicles.model,
            vehicle_year: driverVehicles.year,
            vehicle_plate: driverVehicles.license_plate,
            driver_name: users.full_name,
          })
          .from(jobAssignments)
          .leftJoin(driverVehicles, eq(jobAssignments.vehicle_id, driverVehicles.id))
          .leftJoin(users, eq(jobAssignments.driver_id, users.id))
          .where(inArray(jobAssignments.job_id, jobIds));
        for (const a of assignments) {
          if (a.job_id) {
            appliedByJob[a.job_id] = (appliedByJob[a.job_id] || 0) + 1;
            if (a.status === 'approved' || a.status === 'accepted') {
              approvedByJob[a.job_id] = (approvedByJob[a.job_id] || 0) + 1;
              if (a.vehicle_id) {
                if (!vehiclesByJob[a.job_id]) vehiclesByJob[a.job_id] = [];
                vehiclesByJob[a.job_id].push({
                  make: a.vehicle_make,
                  model: a.vehicle_model,
                  year: a.vehicle_year,
                  plate: a.vehicle_plate,
                  driverName: a.driver_name,
                });
              }
            }
          }
        }
      }

      const dailyCapacity: Record<string, { booked: number; needed: number; jobCount: number }> = {};
      const dailyJobs: Record<string, any[]> = {};
      const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
      for (const job of contractorJobs) {
        if (!job.scheduled_date) continue;
        const dateRange = getJobDateRange({
          scheduled_date: job.scheduled_date,
          estimated_days: job.estimated_days,
          listed_days: (job as any).listed_days || null,
          includes_weekends: job.includes_weekends,
        });
        const jobData = {
          id: job.id,
          material: job.material || 'Unknown',
          projectName: job.project_name || '',
          trucksNeeded: job.trucks_needed || 1,
          applied: appliedByJob[job.id] || 0,
          approved: approvedByJob[job.id] || 0,
          assignedVehicles: vehiclesByJob[job.id] || [],
          status: job.status || 'open',
          pickup: job.origin_address || '',
          dropoff: job.destination_address || '',
          estimatedDays: parseFloat(job.estimated_days as string || '1') || 1,
          jobType: job.job_type || 'single_load',
        };
        for (const key of dateRange) {
          if (!key.startsWith(monthPrefix)) continue;
          if (!dailyCapacity[key]) {
            dailyCapacity[key] = { booked: 0, needed: 0, jobCount: 0 };
          }
          dailyCapacity[key].booked += approvedByJob[job.id] || 0;
          dailyCapacity[key].needed += job.trucks_needed || 1;
          dailyCapacity[key].jobCount += 1;
          if (!dailyJobs[key]) dailyJobs[key] = [];
          dailyJobs[key].push(jobData);
        }
      }

      return res.json({ fleetSize, dailyCapacity, dailyJobs });
    } catch (err) {
      console.error("Contractor calendar capacity error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/driver/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { filter } = req.query;

      const statusFilter = filter === 'completed'
        ? [eq(jobs.status, 'completed')]
        : [
            or(
              eq(jobs.status, 'open' as any),
              eq(jobs.status, 'pending' as any),
              eq(jobs.status, 'accepted' as any),
              eq(jobs.status, 'in_progress' as any)
            )!
          ];

      const assignedJobs = await db
        .select({
          assignment_id: jobAssignments.id,
          assignment_status: jobAssignments.status,
          vehicle_id: jobAssignments.vehicle_id,
          job_id: jobs.id,
          material: jobs.material,
          origin_address: jobs.origin_address,
          destination_address: jobs.destination_address,
          scheduled_date: jobs.scheduled_date,
          pickup_time: jobs.pickup_time,
          status: jobs.status,
          truck_type: jobs.truck_type,
          trucks_needed: jobs.trucks_needed,
          rate: jobs.rate,
          rate_type: jobs.rate_type,
          project_name: contractorProjects.name,
          contractor_name: sql<string>`(SELECT full_name FROM users WHERE id = ${jobs.contractor_id})`,
          contractor_company: sql<string>`(SELECT company FROM users WHERE id = ${jobs.contractor_id})`,
        })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.job_id, jobs.id))
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(
          and(
            eq(jobAssignments.driver_id, userId),
            sql`${jobAssignments.status}::text IN ('approved', 'accepted', 'pending')`,
            ...statusFilter
          )
        )
        .orderBy(desc(jobs.scheduled_date));

      const vehicleIds = assignedJobs.map(j => j.vehicle_id).filter(Boolean) as string[];
      let vehicleMap: Record<string, any> = {};
      if (vehicleIds.length > 0) {
        const vehicles = await db.select().from(driverVehicles).where(inArray(driverVehicles.id, vehicleIds));
        for (const v of vehicles) vehicleMap[v.id] = v;
      }

      const result = assignedJobs.map(job => {
        const vehicle = job.vehicle_id ? vehicleMap[job.vehicle_id] : null;
        return {
          assignmentId: job.assignment_id,
          id: job.job_id,
          material: job.material || 'Unknown',
          projectName: job.project_name || '',
          pickup: job.origin_address || '',
          dropoff: job.destination_address || '',
          pickupTime: job.pickup_time || '',
          scheduledDate: job.scheduled_date,
          status: job.status || 'open',
          assignmentStatus: job.assignment_status,
          truckType: job.truck_type || '',
          trucksNeeded: job.trucks_needed || 1,
          contractorName: job.contractor_name || '',
          contractorCompany: job.contractor_company || '',
          rate: job.rate,
          rateType: job.rate_type,
          vehicle: vehicle ? {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.license_plate,
            truckType: vehicle.truck_type,
          } : null,
        };
      });

      return res.json(result);
    } catch (err) {
      console.error("Driver jobs error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { assignmentId } = req.params;
      const { vehicleId } = req.body;

      const [assignment] = await db
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.id, assignmentId))
        .limit(1);

      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.driver_id !== userId) return res.status(403).json({ message: "Not authorized" });

      if (vehicleId) {
        const [vehicle] = await db.select().from(driverVehicles).where(eq(driverVehicles.id, vehicleId)).limit(1);
        if (!vehicle || vehicle.driver_id !== userId) return res.status(400).json({ message: "Vehicle not found" });
      }

      await db
        .update(jobAssignments)
        .set({ vehicle_id: vehicleId || null })
        .where(eq(jobAssignments.id, assignmentId));

      return res.json({ success: true });
    } catch (err) {
      console.error("Assign vehicle error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/calendar/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { month, year } = req.query;
      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      const m = parseInt(month as string);
      const y = parseInt(year as string);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

      const maxJobDays = 30;
      const extendedStart = new Date(Date.UTC(y, m - 1, 1));
      extendedStart.setUTCDate(extendedStart.getUTCDate() - maxJobDays);

      const assignedJobs = await db
        .select({
          job_id: jobs.id,
          material: jobs.material,
          origin_address: jobs.origin_address,
          destination_address: jobs.destination_address,
          scheduled_date: jobs.scheduled_date,
          pickup_time: jobs.pickup_time,
          status: jobs.status,
          truck_type: jobs.truck_type,
          trucks_needed: jobs.trucks_needed,
          rate: jobs.rate,
          rate_type: jobs.rate_type,
          estimated_days: jobs.estimated_days,
          listed_days: jobs.listed_days,
          includes_weekends: jobs.includes_weekends,
          project_name: contractorProjects.name,
          assignment_status: jobAssignments.status,
          vehicle_id: jobAssignments.vehicle_id,
          contractor_name: sql<string>`(SELECT full_name FROM users WHERE id = ${jobs.contractor_id})`,
        })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.job_id, jobs.id))
        .leftJoin(contractorProjects, eq(jobs.project_id, contractorProjects.id))
        .where(
          and(
            eq(jobAssignments.driver_id, userId),
            sql`${jobAssignments.status}::text IN ('approved', 'accepted', 'pending')`,
            gte(jobs.scheduled_date, extendedStart),
            lte(jobs.scheduled_date, monthEnd),
            sql`${jobs.status}::text IN ('open', 'pending', 'accepted', 'in_progress', 'completed')`
          )
        );

      const vehicleIds = assignedJobs.map(j => j.vehicle_id).filter(Boolean) as string[];
      let vehicleMap: Record<string, any> = {};
      if (vehicleIds.length > 0) {
        const vehicles = await db
          .select()
          .from(driverVehicles)
          .where(inArray(driverVehicles.id, vehicleIds));
        for (const v of vehicles) {
          vehicleMap[v.id] = v;
        }
      }

      const dailyJobs: Record<string, any[]> = {};
      const jobDates: string[] = [];

      for (const job of assignedJobs) {
        if (!job.scheduled_date) continue;
        const startDate = new Date(job.scheduled_date);

        const durationDays = Math.max(1, Math.ceil(parseFloat(job.listed_days as string || job.estimated_days as string || '1')));

        const vehicle = job.vehicle_id ? vehicleMap[job.vehicle_id] : null;
        const jobData = {
          id: job.job_id,
          material: job.material || 'Unknown',
          projectName: job.project_name || '',
          pickup: job.origin_address || '',
          dropoff: job.destination_address || '',
          pickupTime: job.pickup_time || '',
          status: job.status || 'open',
          assignmentStatus: job.assignment_status,
          truckType: job.truck_type || '',
          contractorName: job.contractor_name || '',
          rate: job.rate,
          rateType: job.rate_type,
          durationDays,
          vehicle: vehicle ? {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.license_plate,
            truckType: vehicle.truck_type,
          } : null,
        };

        const dateRange = getJobDateRange({
          scheduled_date: job.scheduled_date,
          estimated_days: job.estimated_days as string | null,
          listed_days: job.listed_days as string | null,
          includes_weekends: (job as any).includes_weekends ?? null,
        });
        const driverMonthPrefix = `${y}-${String(m).padStart(2, '0')}`;
        dateRange.forEach((key, idx) => {
          if (!key.startsWith(driverMonthPrefix)) return;
          if (!dailyJobs[key]) dailyJobs[key] = [];
          if (!jobDates.includes(key)) jobDates.push(key);
          dailyJobs[key].push({ ...jobData, isMultiDay: durationDays > 1, dayNumber: idx + 1, totalDays: durationDays, isContinuation: idx > 0 });
        });
      }

      return res.json({ dailyJobs, jobDates });
    } catch (err) {
      console.error("Calendar jobs error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/jobs/:id/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.contractor_id !== userId) return res.status(403).json({ message: "Not authorized" });

      const result = await db
        .select({
          assignment: jobAssignments,
          driver_name: users.full_name,
          driver_phone: users.phone,
          driver_truck_type: users.truck_type,
          driver_rating: users.rating,
          driver_company: users.company,
          driver_email: users.email,
          driver_dot_number: users.dot_number,
          driver_mc_number: users.mc_number,
          driver_cdl_number: users.cdl_number,
          driver_cdl_state: users.cdl_state,
          driver_trucking_company_id: users.trucking_company_id,
          driver_profile_image: users.profile_image_url,
        })
        .from(jobAssignments)
        .leftJoin(users, eq(jobAssignments.driver_id, users.id))
        .where(eq(jobAssignments.job_id, id));

      const assignmentResults = [];
      for (const r of result) {
        const driverId = r.assignment.driver_id;
        let vehicle = null;
        if (driverId) {
          const vehicles = await db
            .select()
            .from(driverVehicles)
            .where(eq(driverVehicles.driver_id, driverId))
            .orderBy(desc(driverVehicles.is_primary))
            .limit(1);
          if (vehicles.length > 0) vehicle = vehicles[0];
        }

        let truckingCompanyName = null;
        if (r.driver_trucking_company_id) {
          const [tc] = await db
            .select({ company: users.company, full_name: users.full_name })
            .from(users)
            .where(eq(users.id, r.driver_trucking_company_id))
            .limit(1);
          if (tc) truckingCompanyName = tc.company || tc.full_name;
        }

        assignmentResults.push({
          ...r.assignment,
          driver_name: r.driver_name || "Unknown",
          driver_phone: r.driver_phone || "",
          driver_truck_type: r.driver_truck_type || null,
          driver_rating: r.driver_rating || null,
          driver_company: r.driver_company || null,
          driver_email: r.driver_email || null,
          driver_dot_number: r.driver_dot_number || null,
          driver_mc_number: r.driver_mc_number || null,
          driver_cdl_number: r.driver_cdl_number || null,
          driver_cdl_state: r.driver_cdl_state || null,
          driver_profile_image: r.driver_profile_image || null,
          trucking_company_name: truckingCompanyName || r.driver_company || null,
          vehicle: vehicle ? {
            id: vehicle.id,
            truck_type: vehicle.truck_type,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            license_plate: vehicle.license_plate,
            truck_number: vehicle.truck_number,
            max_capacity_tons: vehicle.max_capacity_tons,
          } : null,
        });
      }

      return res.json(assignmentResults);
    } catch (err) {
      console.error("Job assignments error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id, assignmentId } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.contractor_id !== userId) return res.status(403).json({ message: "Not authorized" });

      const [assignment] = await db
        .update(jobAssignments)
        .set({ status: "approved", approved_at: new Date() })
        .where(eq(jobAssignments.id, assignmentId))
        .returning();

      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      await db
        .update(jobs)
        .set({ status: "in_progress", updated_at: new Date() })
        .where(eq(jobs.id, id));

      await db.insert(notifications).values({
        user_id: assignment.driver_id!,
        type: "load_approved",
        title: "Assignment Approved",
        message: `Your assignment for the ${job.material} job has been approved`,
        job_id: id,
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("Approve assignment error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id, assignmentId } = req.params;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.contractor_id !== userId) return res.status(403).json({ message: "Not authorized" });

      const [assignment] = await db
        .update(jobAssignments)
        .set({ status: "rejected" })
        .where(eq(jobAssignments.id, assignmentId))
        .returning();

      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      await db
        .update(jobs)
        .set({ driver_id: null, status: "open", updated_at: new Date() })
        .where(eq(jobs.id, id));

      await db.insert(notifications).values({
        user_id: assignment.driver_id!,
        type: "load_rejected",
        title: "Assignment Rejected",
        message: `Your assignment for the ${job.material} job has been rejected`,
        job_id: id,
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("Reject assignment error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ VEHICLE MANAGEMENT ============

  app.post("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { truck_type, make, model, year, license_plate, vin_number, max_capacity_tons, truck_number, is_primary } = req.body;

      if (is_primary) {
        await db
          .update(driverVehicles)
          .set({ is_primary: false })
          .where(eq(driverVehicles.driver_id, userId));
      }

      const [vehicle] = await db
        .insert(driverVehicles)
        .values({
          driver_id: userId,
          truck_type,
          make,
          model,
          year,
          license_plate,
          vin_number,
          max_capacity_tons,
          truck_number,
          is_primary: is_primary ?? false,
        })
        .returning();

      return res.json(vehicle);
    } catch (err) {
      console.error("Add vehicle error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [vehicle] = await db.select().from(driverVehicles).where(eq(driverVehicles.id, id)).limit(1);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.driver_id !== userId) return res.status(403).json({ message: "Not authorized" });

      const updates = { ...req.body };
      delete updates.id;
      delete updates.driver_id;
      updates.updated_at = new Date();

      if (updates.is_primary) {
        await db
          .update(driverVehicles)
          .set({ is_primary: false })
          .where(eq(driverVehicles.driver_id, userId));
      }

      const [updated] = await db
        .update(driverVehicles)
        .set(updates)
        .where(eq(driverVehicles.id, id))
        .returning();

      return res.json(updated);
    } catch (err) {
      console.error("Update vehicle error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

      const [vehicle] = await db.select().from(driverVehicles).where(eq(driverVehicles.id, id)).limit(1);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.driver_id !== userId) return res.status(403).json({ message: "Not authorized" });

      await db
        .update(driverVehicles)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(driverVehicles.id, id));

      return res.json({ ok: true });
    } catch (err) {
      console.error("Delete vehicle error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ INVOICES ============

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { status } = req.query;

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ message: "User not found" });

      const conditions: any[] = [];
      const role = user.role || "";

      if (role.includes("contractor")) {
        conditions.push(eq(monthlyInvoices.contractor_id, userId));
      } else if (role.includes("driver")) {
        conditions.push(eq(monthlyInvoices.driver_id, userId));
      } else {
        conditions.push(
          or(
            eq(monthlyInvoices.contractor_id, userId),
            eq(monthlyInvoices.driver_id, userId)
          )!
        );
      }

      if (status && status !== "all") {
        conditions.push(eq(monthlyInvoices.status, status as any));
      }

      const contractorUsers = db
        .select({ id: users.id, full_name: users.full_name, company: users.company })
        .from(users)
        .as("contractor_users");

      const driverUsers = db
        .select({ id: users.id, full_name: users.full_name, company: users.company })
        .from(users)
        .as("driver_users");

      const invoices = await db
        .select()
        .from(monthlyInvoices)
        .where(and(...conditions))
        .orderBy(desc(monthlyInvoices.period_month));

      const invoiceIds = invoices.map((inv) => inv.contractor_id).concat(invoices.map((inv) => inv.driver_id)).filter(Boolean) as string[];
      const uniqueUserIds = [...new Set(invoiceIds)];

      let userMap = new Map<string, { full_name: string | null; company: string | null }>();
      if (uniqueUserIds.length > 0) {
        const relatedUsers = await db
          .select({ id: users.id, full_name: users.full_name, company: users.company })
          .from(users)
          .where(inArray(users.id, uniqueUserIds));
        for (const u of relatedUsers) {
          userMap.set(u.id, { full_name: u.full_name, company: u.company });
        }
      }

      const result = invoices.map((inv) => ({
        ...inv,
        contractor_name: userMap.get(inv.contractor_id!)?.full_name || "Unknown",
        contractor_company: userMap.get(inv.contractor_id!)?.company || "Unknown",
        driver_name: userMap.get(inv.driver_id!)?.full_name || "Unknown",
        driver_company: userMap.get(inv.driver_id!)?.company || null,
      }));

      return res.json(result);
    } catch (err) {
      console.error("Invoices error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [invoice] = await db
        .select()
        .from(monthlyInvoices)
        .where(eq(monthlyInvoices.id, id))
        .limit(1);

      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const invoiceJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.invoice_id, id));

      return res.json({
        ...invoice,
        jobs: invoiceJobs,
      });
    } catch (err) {
      console.error("Invoice detail error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/invoices/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { status: newStatus } = req.body;

      const validStatuses = ["open", "issued", "payment_sent", "payment_received", "void"];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const [invoice] = await db
        .select()
        .from(monthlyInvoices)
        .where(eq(monthlyInvoices.id, id))
        .limit(1);

      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const updateData: any = { status: newStatus, updated_at: new Date() };
      if (newStatus === "issued") updateData.issued_at = new Date();
      if (newStatus === "payment_received") updateData.paid_at = new Date();

      await db
        .update(monthlyInvoices)
        .set(updateData)
        .where(eq(monthlyInvoices.id, id));

      const notifyUserId = invoice.contractor_id === userId ? invoice.driver_id : invoice.contractor_id;
      if (notifyUserId) {
        await db.insert(notifications).values({
          user_id: notifyUserId,
          type: "general",
          title: "Invoice Updated",
          message: `Invoice ${invoice.invoice_number} status changed to ${newStatus}`,
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("Update invoice status error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ MATERIALS (distinct from user's jobs) ============

  app.get("/api/materials", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const result = await db
        .selectDistinct({ material: jobs.material })
        .from(jobs)
        .where(eq(jobs.contractor_id, userId))
        .orderBy(jobs.material);

      const materials = result
        .map((r) => r.material)
        .filter((m): m is string => !!m && m.trim().length > 0);

      return res.json(materials);
    } catch (err) {
      console.error("Materials error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ CONTRACTOR PROJECTS ============

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const includeDeleted = req.query.include_deleted === 'true';
      const conditions: any[] = [eq(contractorProjects.contractor_id, userId)];
      if (!includeDeleted) {
        conditions.push(isNull(contractorProjects.deleted_at));
      }

      const projects = await db
        .select()
        .from(contractorProjects)
        .where(and(...conditions))
        .orderBy(desc(contractorProjects.created_at));

      const projectIds = projects.map((p) => p.id);

      let jobCounts = new Map<string, number>();
      if (projectIds.length > 0) {
        const counts = await db
          .select({
            project_id: jobs.project_id,
            count: sql<number>`count(*)::int`,
          })
          .from(jobs)
          .where(inArray(jobs.project_id, projectIds))
          .groupBy(jobs.project_id);

        for (const c of counts) {
          if (c.project_id) jobCounts.set(c.project_id, c.count);
        }
      }

      const result = projects.map((p) => ({
        ...p,
        job_count: jobCounts.get(p.id) || 0,
      }));

      return res.json(result);
    } catch (err) {
      console.error("Projects error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { name, job_number, site_address, notes } = req.body;

      const [project] = await db
        .insert(contractorProjects)
        .values({
          contractor_id: userId,
          name,
          ...(job_number ? { job_number } : {}),
          ...(site_address ? { site_address } : {}),
          ...(notes ? { notes } : {}),
        })
        .returning();

      return res.json(project);
    } catch (err) {
      console.error("Create project error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const projectId = req.params.id;
      const { name, job_number, site_address, notes, awarded_amount, status } = req.body;

      const [existing] = await db
        .select()
        .from(contractorProjects)
        .where(and(eq(contractorProjects.id, projectId), eq(contractorProjects.contractor_id, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updateData: any = { updated_at: new Date() };
      if (name !== undefined) updateData.name = name;
      if (job_number !== undefined) updateData.job_number = job_number;
      if (site_address !== undefined) updateData.site_address = site_address;
      if (notes !== undefined) updateData.notes = notes;
      if (awarded_amount !== undefined) updateData.awarded_amount = awarded_amount;
      if (status !== undefined) updateData.status = status;

      const [updated] = await db
        .update(contractorProjects)
        .set(updateData)
        .where(eq(contractorProjects.id, projectId))
        .returning();

      return res.json(updated);
    } catch (err) {
      console.error("Update project error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const projectId = req.params.id;

      const [existing] = await db
        .select()
        .from(contractorProjects)
        .where(and(eq(contractorProjects.id, projectId), eq(contractorProjects.contractor_id, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      await db
        .update(contractorProjects)
        .set({ deleted_at: new Date(), status: "deleted", updated_at: new Date() })
        .where(eq(contractorProjects.id, projectId));

      await db
        .update(jobs)
        .set({ status: "cancelled", cancelled_at: new Date() })
        .where(and(eq(jobs.project_id, projectId), eq(jobs.contractor_id, userId), not(eq(jobs.status, "cancelled"))));

      return res.json({ message: "Project deleted" });
    } catch (err) {
      console.error("Delete project error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/projects/:id/restore", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const projectId = req.params.id;

      const [existing] = await db
        .select()
        .from(contractorProjects)
        .where(and(eq(contractorProjects.id, projectId), eq(contractorProjects.contractor_id, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      await db
        .update(contractorProjects)
        .set({ deleted_at: null, status: "active", updated_at: new Date() })
        .where(eq(contractorProjects.id, projectId));

      return res.json({ message: "Project restored" });
    } catch (err) {
      console.error("Restore project error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/places/autocomplete", requireAuth, async (req: Request, res: Response) => {
    try {
      const input = req.query.input as string;
      if (!input || input.trim().length < 2) return res.json([]);

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const lat = req.query.lat as string;
      const lng = req.query.lng as string;

      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("types", "geocode|establishment");
      url.searchParams.set("components", "country:us|country:ca");
      if (lat && lng) {
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", "80000");
      }

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error("Places API status:", data.status, data.error_message);
      }

      const predictions = (data.predictions || []).map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
      }));

      return res.json(predictions);
    } catch (err) {
      console.error("Places autocomplete error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/places/details", requireAuth, async (req: Request, res: Response) => {
    try {
      const placeId = req.query.place_id as string;
      if (!placeId) return res.status(400).json({ message: "place_id required" });

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("fields", "geometry,formatted_address");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.result) {
        return res.json({
          address: data.result.formatted_address,
          lat: data.result.geometry?.location?.lat,
          lng: data.result.geometry?.location?.lng,
        });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (err) {
      console.error("Place details error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/directions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { origin_lat, origin_lng, dest_lat, dest_lng } = req.query;
      if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
        return res.status(400).json({ message: "Origin and destination coordinates required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${origin_lat},${origin_lng}`);
      url.searchParams.set("destination", `${dest_lat},${dest_lng}`);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        const durationSeconds = leg.duration.value;
        const distanceMeters = leg.distance.value;
        const distanceMiles = (distanceMeters / 1609.34).toFixed(1);
        const truckDurationSeconds = Math.round(durationSeconds * 1.4);

        return res.json({
          duration_seconds: durationSeconds,
          duration_text: leg.duration.text,
          truck_duration_seconds: truckDurationSeconds,
          truck_duration_text: formatDuration(truckDurationSeconds),
          distance_miles: parseFloat(distanceMiles),
          distance_text: leg.distance.text,
        });
      }
      return res.status(404).json({ message: "No route found" });
    } catch (err) {
      console.error("Directions error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/map-embed", async (req: Request, res: Response) => {
    try {
      const { oLat, oLng, dLat, dLng, hasOrigin, hasDest } = req.query;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).send("Map API not configured");

      const originLat = parseFloat(oLat as string) || 0;
      const originLng = parseFloat(oLng as string) || 0;
      const destLat = parseFloat(dLat as string) || 0;
      const destLng = parseFloat(dLng as string) || 0;
      const showOrigin = hasOrigin === 'true';
      const showDest = hasDest === 'true';

      const centerLat = showOrigin && showDest ? (originLat + destLat) / 2 : showOrigin ? originLat : destLat;
      const centerLng = showOrigin && showDest ? (originLng + destLng) / 2 : showOrigin ? originLng : destLng;

      const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body>
<div id="map"></div>
<script>
function initMap(){
  const map=new google.maps.Map(document.getElementById('map'),{
    center:{lat:${centerLat},lng:${centerLng}},zoom:11,
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
    styles:[{elementType:'geometry',stylers:[{color:'#1d2c4d'}]},{elementType:'labels.text.fill',stylers:[{color:'#8ec3b9'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1a3646'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#304a7d'}]},{featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#255d7a'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#17263c'}]}]
  });
  ${showOrigin ? `new google.maps.Marker({position:{lat:${originLat},lng:${originLng}},map,title:'Pickup',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#22c55e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ''}
  ${showDest ? `new google.maps.Marker({position:{lat:${destLat},lng:${destLng}},map,title:'Dropoff',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#FF9900',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ''}
  ${showOrigin && showDest ? `
  const ds=new google.maps.DirectionsService();
  const dr=new google.maps.DirectionsRenderer({suppressMarkers:true,polylineOptions:{strokeColor:'#3b82f6',strokeWeight:4}});
  dr.setMap(map);
  ds.route({origin:{lat:${originLat},lng:${originLng}},destination:{lat:${destLat},lng:${destLng}},travelMode:'DRIVING'},function(r,s){
    if(s==='OK'){dr.setDirections(r);const b=new google.maps.LatLngBounds();b.extend({lat:${originLat},lng:${originLng}});b.extend({lat:${destLat},lng:${destLng}});map.fitBounds(b,60);}
  });` : ''}
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap" async defer></script>
</body></html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (err) {
      console.error("Map embed error:", err);
      return res.status(500).send("Error loading map");
    }
  });

  app.get("/api/directions/polyline", requireAuth, async (req: Request, res: Response) => {
    try {
      const { origin_lat, origin_lng, dest_lat, dest_lng } = req.query;
      if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
        return res.status(400).json({ message: "Origin and destination coordinates required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${origin_lat},${origin_lng}`);
      url.searchParams.set("destination", `${dest_lat},${dest_lng}`);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const encodedPolyline = route.overview_polyline?.points || '';
        const points: { lat: number; lng: number }[] = [];

        if (encodedPolyline) {
          let index = 0, lat = 0, lng = 0;
          while (index < encodedPolyline.length) {
            let b, shift = 0, result = 0;
            do { b = encodedPolyline.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);
            shift = 0; result = 0;
            do { b = encodedPolyline.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);
            points.push({ lat: lat / 1e5, lng: lng / 1e5 });
          }
        }

        return res.json({ points });
      }
      return res.json({ points: [] });
    } catch (err) {
      console.error("Polyline directions error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ============ REVIEWS ============

  app.post("/api/reviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { jobId, revieweeId, rating, comment } = req.body;

      if (!jobId || !revieweeId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Job ID, reviewee ID, and rating (1-5) required" });
      }

      if (parseInt(rating) < 3 && (!comment || comment.trim().length < 10)) {
        return res.status(400).json({ message: "Constructive feedback is required for ratings below 3 stars" });
      }

      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const isDriverOnJob = job.driver_id === userId ||
        (await db.select().from(jobAssignments)
          .where(and(eq(jobAssignments.job_id, jobId), eq(jobAssignments.driver_id, userId)))
          .limit(1)).length > 0;
      const isContractorOnJob = job.contractor_id === userId;

      if (!isDriverOnJob && !isContractorOnJob) {
        return res.status(403).json({ message: "You are not part of this job" });
      }

      const existing = await db.select().from(reviews)
        .where(and(
          eq(reviews.job_id, jobId),
          eq(reviews.reviewer_id, userId),
          eq(reviews.reviewee_id, revieweeId)
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({ message: "You already reviewed this person for this job" });
      }

      const [reviewer] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      const [review] = await db.insert(reviews).values({
        job_id: jobId,
        reviewer_id: userId,
        reviewee_id: revieweeId,
        rating: parseInt(rating),
        comment: comment || null,
        reviewer_role: reviewer?.role || 'driver',
      }).returning();

      const allReviews = await db.select().from(reviews)
        .where(eq(reviews.reviewee_id, revieweeId));
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

      await db.update(users)
        .set({ rating: avgRating.toFixed(2) })
        .where(eq(users.id, revieweeId));

      return res.json(review);
    } catch (err) {
      console.error("Submit review error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    try {
      const contractorId = (req.session as any).userId;
      const { driverId } = req.params;
      const [fav] = await db
        .select()
        .from(contractorFavoriteDrivers)
        .where(and(
          eq(contractorFavoriteDrivers.contractor_id, contractorId),
          eq(contractorFavoriteDrivers.driver_id, driverId)
        ))
        .limit(1);
      return res.json({ isFavorite: !!fav });
    } catch (err) {
      return res.json({ isFavorite: false });
    }
  });

  app.post("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    try {
      const contractorId = (req.session as any).userId;
      const { driverId } = req.params;
      const [existing] = await db
        .select()
        .from(contractorFavoriteDrivers)
        .where(and(
          eq(contractorFavoriteDrivers.contractor_id, contractorId),
          eq(contractorFavoriteDrivers.driver_id, driverId)
        ))
        .limit(1);
      if (existing) {
        await db.delete(contractorFavoriteDrivers).where(eq(contractorFavoriteDrivers.id, existing.id));
        return res.json({ isFavorite: false });
      } else {
        await db.insert(contractorFavoriteDrivers).values({
          contractor_id: contractorId,
          driver_id: driverId,
        });
        return res.json({ isFavorite: true });
      }
    } catch (err) {
      console.error("Favorite toggle error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/reviews/pending", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;

      const reviewNotifs = await db.select().from(notifications)
        .where(and(
          eq(notifications.user_id, userId),
          eq(notifications.type, "load_completed")
        ));

      const jobIds = [...new Set(reviewNotifs.map(n => n.job_id).filter(Boolean))] as string[];
      if (jobIds.length === 0) return res.json([]);

      const existingReviews = await db.select().from(reviews)
        .where(eq(reviews.reviewer_id, userId));

      const reviewedJobPairs = new Set(
        existingReviews.map(r => `${r.job_id}:${r.reviewee_id}`)
      );

      const pendingReviews: any[] = [];

      for (const jobId of jobIds) {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) continue;

        const otherUserId = job.contractor_id === userId ? job.driver_id : job.contractor_id;
        if (!otherUserId) continue;
        if (reviewedJobPairs.has(`${jobId}:${otherUserId}`)) continue;

        const [otherUser] = await db.select({
          id: users.id,
          full_name: users.full_name,
          first_name: users.first_name,
          last_name: users.last_name,
          company: users.company,
          role: users.role,
          profile_image_url: users.profile_image_url,
        }).from(users).where(eq(users.id, otherUserId)).limit(1);

        if (otherUser) {
          pendingReviews.push({
            jobId,
            material: job.material,
            completedDate: job.completed_date,
            reviewee: otherUser,
          });
        }
      }

      return res.json(pendingReviews);
    } catch (err) {
      console.error("Pending reviews error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/reviews/:userId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const userReviews = await db.select().from(reviews)
        .where(eq(reviews.reviewee_id, userId))
        .orderBy(desc(reviews.created_at));

      const enriched = [];
      for (const rev of userReviews) {
        const [reviewer] = await db.select({
          id: users.id,
          full_name: users.full_name,
          first_name: users.first_name,
          last_name: users.last_name,
          company: users.company,
          role: users.role,
          profile_image_url: users.profile_image_url,
        }).from(users).where(eq(users.id, rev.reviewer_id!)).limit(1);

        const [job] = await db.select({
          id: jobs.id,
          material: jobs.material,
        }).from(jobs).where(eq(jobs.id, rev.job_id!)).limit(1);

        enriched.push({
          ...rev,
          reviewer,
          job,
        });
      }

      const avgRating = userReviews.length > 0
        ? userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length
        : 0;

      return res.json({
        reviews: enriched,
        averageRating: parseFloat(avgRating.toFixed(2)),
        totalReviews: userReviews.length,
      });
    } catch (err) {
      console.error("Get reviews error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
    if (hours > 0) return `${hours} hr`;
    return `${minutes} min`;
  }

  const httpServer = createServer(app);
  return httpServer;
}
