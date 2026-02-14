import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { eq, and, desc, or, ilike, inArray, sql, gte, lte } from "drizzle-orm";
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
} from "@shared/schema";
import bcrypt from "bcrypt";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

const resetTokens = new Map<string, { email: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens) {
    if (data.expiresAt < now) resetTokens.delete(token);
  }
}, 60000);

const PgStore = pgSession(session);

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      store: new PgStore({
        pool: pool,
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || "loadlink-mobile-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: false,
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  function requireAuth(req: Request, res: Response, next: Function) {
    if (!(req.session as any).userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  }

  // ============ AUTH ============

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

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
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Server error" });
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

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (err) {
      console.error("Auth check error:", err);
      return res.status(500).json({ message: "Server error" });
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
      const { status, truck_type, search, driver_id } = req.query;

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

      const result = await db
        .select({
          job: jobs,
          contractor_name: users.full_name,
          contractor_company: users.company,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(jobs.created_at));

      const formattedJobs = result.map((r) => ({
        ...r.job,
        contractor_name: r.contractor_name || "Unknown",
        contractor_company: r.contractor_company || "Unknown Company",
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
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractor_id, users.id))
        .where(eq(jobs.id, id))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const r = result[0];
      const job = {
        ...r.job,
        contractor_name: r.contractor_name || "Unknown",
        contractor_company: r.contractor_company || "Unknown Company",
        contractor_phone: r.contractor_phone || "",
        contractor_email: r.contractor_email || "",
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

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "open") return res.status(400).json({ message: "Job is not available" });

      await db
        .update(jobs)
        .set({ driver_id: userId, status: "accepted", updated_at: new Date() })
        .where(eq(jobs.id, id));

      await db.insert(jobAssignments).values({
        job_id: id,
        driver_id: userId,
        status: "accepted",
      });

      await db.insert(notifications).values({
        user_id: job.contractor_id!,
        type: "load_accepted",
        title: "Job Accepted",
        message: `A driver has accepted your ${job.material} job`,
        job_id: id,
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("Accept job error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;

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
      const { lat, lng } = req.body;

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

      const [updated] = await db
        .update(jobRuns)
        .set({
          status: "completed",
          ended_at: endedAt,
          end_lat: lat?.toString(),
          end_lng: lng?.toString(),
          actual_duration_minutes: actualMinutes,
          billed_duration_minutes: billedMinutes,
        })
        .where(eq(jobRuns.id, runId))
        .returning();

      return res.json(updated);
    } catch (err) {
      console.error("Clock out error:", err);
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
      const { date, isAvailable, startTime, endTime, notes } = req.body;

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

      if (existing.length > 0) {
        const [updated] = await db
          .update(driverAvailability)
          .set({
            is_available: isAvailable ?? true,
            start_time: startTime || "06:00",
            end_time: endTime || "18:00",
            notes,
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
            notes,
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
      delete updates.email;

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

  // ============ VEHICLES ============

  app.get("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const vehicles = await db
        .select()
        .from(driverVehicles)
        .where(eq(driverVehicles.driver_id, userId));
      return res.json(vehicles);
    } catch (err) {
      console.error("Vehicles error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
