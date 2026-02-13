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

      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
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
          fullName,
          firstName: names[0] || "",
          lastName: names.slice(1).join(" ") || "",
          phone: phone || null,
          role: role || "driver",
          loginProvider: "email_password",
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

  // ============ JOBS ============

  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { status, truck_type, search, driver_id } = req.query;

      let query = db
        .select({
          job: jobs,
          contractorName: users.fullName,
          contractorCompany: users.company,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractorId, users.id))
        .orderBy(desc(jobs.createdAt));

      const conditions = [];

      if (status && status !== "all") {
        if (status === "my_jobs" && driver_id) {
          conditions.push(eq(jobs.driverId, driver_id as string));
          conditions.push(
            or(
              eq(jobs.status, "accepted"),
              eq(jobs.status, "in_progress"),
              eq(jobs.status, "pending")
            )!
          );
        } else if (status === "completed" && driver_id) {
          conditions.push(eq(jobs.driverId, driver_id as string));
          conditions.push(eq(jobs.status, "completed"));
        } else {
          conditions.push(eq(jobs.status, status as any));
        }
      }

      if (truck_type && truck_type !== "all") {
        conditions.push(eq(jobs.truckType, truck_type as any));
      }

      if (search) {
        const q = `%${search}%`;
        conditions.push(
          or(
            ilike(jobs.material, q),
            ilike(jobs.originAddress, q),
            ilike(jobs.destinationAddress, q)
          )!
        );
      }

      let result;
      if (conditions.length > 0) {
        result = await query.where(and(...conditions));
      } else {
        result = await query;
      }

      const formattedJobs = result.map((r) => ({
        ...r.job,
        contractorName: r.contractorName || "Unknown",
        contractorCompany: r.contractorCompany || "Unknown Company",
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
          contractorName: users.fullName,
          contractorCompany: users.company,
          contractorPhone: users.phone,
          contractorEmail: users.email,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractorId, users.id))
        .where(eq(jobs.id, id))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const r = result[0];
      const job = {
        ...r.job,
        contractorName: r.contractorName || "Unknown",
        contractorCompany: r.contractorCompany || "Unknown Company",
        contractorPhone: r.contractorPhone || "",
        contractorEmail: r.contractorEmail || "",
      };

      const runs = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobId, id))
        .orderBy(desc(jobRuns.startedAt));

      const assignments = await db
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, id));

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
        .set({ driverId: userId, status: "accepted", updatedAt: new Date() })
        .where(eq(jobs.id, id));

      await db.insert(jobAssignments).values({
        jobId: id,
        driverId: userId,
        status: "accepted",
      });

      await db.insert(notifications).values({
        userId: job.contractorId,
        type: "load_accepted",
        title: "Job Accepted",
        message: `A driver has accepted your ${job.material} job`,
        jobId: id,
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
        .set({ driverId: null, status: "open", updatedAt: new Date() })
        .where(and(eq(jobs.id, id), eq(jobs.driverId, userId)));

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
          jobId: id,
          driverId: userId,
          status: "active",
          startLat: lat?.toString(),
          startLng: lng?.toString(),
        })
        .returning();

      await db
        .update(jobs)
        .set({ status: "in_progress", updatedAt: new Date() })
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

      const startedAt = new Date(run.startedAt!);
      const endedAt = new Date();
      const actualMinutes = Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 60000
      );
      const billedMinutes = Math.max(60, Math.ceil(actualMinutes / 15) * 15);

      const [updated] = await db
        .update(jobRuns)
        .set({
          status: "completed",
          endedAt,
          endLat: lat?.toString(),
          endLng: lng?.toString(),
          actualDurationMinutes: actualMinutes,
          billedDurationMinutes: billedMinutes,
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
        .select({ id: jobs.id, material: jobs.material, contractorId: jobs.contractorId })
        .from(jobs)
        .where(
          or(
            eq(jobs.driverId, userId),
            eq(jobs.contractorId, userId)
          )
        );

      if (myJobs.length === 0) return res.json([]);

      const jobIds = myJobs.map((j) => j.id);

      const messages = await db
        .select()
        .from(jobMessages)
        .where(inArray(jobMessages.jobId, jobIds))
        .orderBy(desc(jobMessages.createdAt));

      const convMap = new Map<string, any>();
      for (const msg of messages) {
        if (!convMap.has(msg.jobId)) {
          const job = myJobs.find((j) => j.id === msg.jobId);
          const otherUserId =
            job?.contractorId === userId ? msg.senderId : job?.contractorId;

          let otherUser = null;
          if (otherUserId) {
            const [u] = await db
              .select({ fullName: users.fullName, company: users.company })
              .from(users)
              .where(eq(users.id, otherUserId))
              .limit(1);
            otherUser = u;
          }

          convMap.set(msg.jobId, {
            id: `conv_${msg.jobId}`,
            jobId: msg.jobId,
            jobMaterial: job?.material || "Unknown",
            contractorName: otherUser?.fullName || "Unknown",
            contractorCompany: otherUser?.company || "Unknown",
            lastMessage: msg.body,
            lastMessageAt: msg.createdAt,
            unreadCount: 0,
          });
        }

        if (!msg.read && msg.senderId !== userId) {
          convMap.get(msg.jobId)!.unreadCount++;
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
          senderName: users.fullName,
        })
        .from(jobMessages)
        .leftJoin(users, eq(jobMessages.senderId, users.id))
        .where(eq(jobMessages.jobId, jobId))
        .orderBy(jobMessages.createdAt);

      const result = msgs.map((m) => ({
        ...m.message,
        senderName: m.senderName || "Unknown",
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
          jobId,
          senderId: userId,
          body,
        })
        .returning();

      const [sender] = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return res.json({
        ...msg,
        senderName: sender?.fullName || "Unknown",
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
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
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
        .set({ isRead: true })
        .where(eq(notifications.userId, userId));

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

      let conditions = [
        eq(jobs.driverId, userId),
        eq(jobs.status, "completed"),
      ];

      const completedJobs = await db
        .select({
          job: jobs,
          contractorCompany: users.company,
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.contractorId, users.id))
        .where(
          dateFilter
            ? and(...conditions, gte(jobs.completedDate, dateFilter))
            : and(...conditions)
        )
        .orderBy(desc(jobs.completedDate));

      const runs = await db
        .select()
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.driverId, userId),
            eq(jobRuns.status, "completed")
          )
        );

      const earnings = completedJobs.map((r) => {
        const jobRun = runs.find((run) => run.jobId === r.job.id);
        const billedHours = jobRun
          ? (jobRun.billedDurationMinutes || 0) / 60
          : 0;
        const rate = Number(r.job.rate) || 0;
        let amount = 0;

        if (r.job.rateType === "per_hour") {
          amount = billedHours * rate;
        } else if (r.job.rateType === "flat_rate") {
          amount = rate;
        } else if (r.job.rateType === "per_load" || r.job.rateType === "per_ton") {
          amount = rate;
        }

        if (amount === 0) amount = Number(r.job.estimatedCost) || rate;

        return {
          id: r.job.id,
          jobId: r.job.id,
          material: r.job.material,
          contractorCompany: r.contractorCompany || "Unknown",
          date: r.job.completedDate || r.job.scheduledDate,
          billedHours,
          rate,
          rateType: r.job.rateType,
          amount,
          status: r.job.paymentStatus === "payment_received" ? "paid" : "pending",
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

      let conditions = [eq(driverAvailability.driverId, userId)];

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
            eq(driverAvailability.driverId, userId),
            eq(driverAvailability.date, dateObj)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db
          .update(driverAvailability)
          .set({
            isAvailable: isAvailable ?? true,
            startTime: startTime || "06:00",
            endTime: endTime || "18:00",
            notes,
            updatedAt: new Date(),
          })
          .where(eq(driverAvailability.id, existing[0].id))
          .returning();
        return res.json(updated);
      } else {
        const [created] = await db
          .insert(driverAvailability)
          .values({
            driverId: userId,
            date: dateObj,
            isAvailable: isAvailable ?? true,
            startTime: startTime || "06:00",
            endTime: endTime || "18:00",
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
        .where(eq(driverVehicles.driverId, userId));

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

      const [updated] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
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
          isConnected,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
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
        .where(eq(driverVehicles.driverId, userId));
      return res.json(vehicles);
    } catch (err) {
      console.error("Vehicles error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
