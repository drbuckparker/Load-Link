var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  contractorFavoriteDrivers: () => contractorFavoriteDrivers,
  contractorProjects: () => contractorProjects,
  conversationActions: () => conversationActions,
  driverAvailability: () => driverAvailability,
  driverVehicles: () => driverVehicles,
  insertUserSchema: () => insertUserSchema,
  invoiceStatusEnum: () => invoiceStatusEnum,
  jobAssignmentStatusEnum: () => jobAssignmentStatusEnum,
  jobAssignments: () => jobAssignments,
  jobMessages: () => jobMessages,
  jobRunStatusEnum: () => jobRunStatusEnum,
  jobRuns: () => jobRuns,
  jobStatusEnum: () => jobStatusEnum,
  jobs: () => jobs,
  loginProviderEnum: () => loginProviderEnum,
  monthlyInvoices: () => monthlyInvoices,
  notificationTypeEnum: () => notificationTypeEnum,
  notifications: () => notifications,
  paymentStatusEnum: () => paymentStatusEnum,
  recurrenceTypeEnum: () => recurrenceTypeEnum,
  reviews: () => reviews,
  sessions: () => sessions,
  truckTypeEnum: () => truckTypeEnum,
  userRoleEnum: () => userRoleEnum,
  users: () => users,
  weightTickets: () => weightTickets
});
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var truckTypeEnum = pgEnum("truck_type", [
  "tandem_dump",
  "tri_axle",
  "end_dump",
  "super_dump",
  "side_dump",
  "belly_dump"
]);
var jobStatusEnum = pgEnum("job_status", [
  "open",
  "accepted",
  "pending",
  "in_progress",
  "completed",
  "cancelled"
]);
var notificationTypeEnum = pgEnum("notification_type", [
  "new_load",
  "load_accepted",
  "load_approved",
  "load_rejected",
  "load_completed",
  "message",
  "general",
  "foreman_invitation",
  "job_expired",
  "job_date_changed"
]);
var userRoleEnum = pgEnum("user_role", [
  "driver",
  "contractor",
  "admin",
  "trucking_company",
  "trucking_company_contractor",
  "driver_contractor",
  "foreman",
  "driver_trucking_company"
]);
var jobRunStatusEnum = pgEnum("job_run_status", [
  "active",
  "completed",
  "cancelled"
]);
var paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "payment_sent",
  "payment_received"
]);
var invoiceStatusEnum = pgEnum("invoice_status", [
  "open",
  "issued",
  "payment_sent",
  "payment_received",
  "void"
]);
var recurrenceTypeEnum = pgEnum("recurrence_type", [
  "none",
  "weekly"
]);
var loginProviderEnum = pgEnum("login_provider", [
  "replit_auth",
  "email_password"
]);
var jobAssignmentStatusEnum = pgEnum("job_assignment_status", [
  "pending",
  "accepted",
  "approved",
  "rejected"
]);
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),
  password: text("password"),
  role: userRoleEnum("role"),
  full_name: text("full_name"),
  phone: text("phone"),
  email: text("email"),
  company: text("company"),
  truck_type: truckTypeEnum("truck_type"),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  created_at: timestamp("created_at").defaultNow(),
  profile_image: text("profile_image"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip_code: text("zip_code"),
  truck_year: integer("truck_year"),
  truck_make: text("truck_make"),
  truck_model: text("truck_model"),
  license_plate: text("license_plate"),
  cdl_number: text("cdl_number"),
  cdl_state: text("cdl_state"),
  insurance_provider: text("insurance_provider"),
  insurance_policy_number: text("insurance_policy_number"),
  mc_number: text("mc_number"),
  dot_number: text("dot_number"),
  company_logo: text("company_logo"),
  business_type: text("business_type"),
  years_in_business: integer("years_in_business"),
  website: text("website"),
  total_jobs: integer("total_jobs").default(0),
  first_name: text("first_name"),
  last_name: text("last_name"),
  profile_image_url: text("profile_image_url"),
  updated_at: timestamp("updated_at"),
  cdl_image_url: text("cdl_image_url"),
  trucking_company_id: varchar("trucking_company_id"),
  fleet_size: integer("fleet_size"),
  dot_number_company: text("dot_number_company"),
  mc_number_company: text("mc_number_company"),
  truck_is_active: boolean("truck_is_active").default(true),
  truck_issue_notes: text("truck_issue_notes"),
  contact_person: text("contact_person"),
  accounting_contact_name: text("accounting_contact_name"),
  accounting_contact_email: text("accounting_contact_email"),
  primary_location_address: text("primary_location_address"),
  primary_location_lat: numeric("primary_location_lat"),
  primary_location_lng: numeric("primary_location_lng"),
  secondary_location_address: text("secondary_location_address"),
  secondary_location_lat: numeric("secondary_location_lat"),
  secondary_location_lng: numeric("secondary_location_lng"),
  tertiary_location_address: text("tertiary_location_address"),
  tertiary_location_lat: numeric("tertiary_location_lat"),
  tertiary_location_lng: numeric("tertiary_location_lng"),
  search_radius_miles: integer("search_radius_miles").default(50),
  last_seen_at: timestamp("last_seen_at"),
  is_connected: boolean("is_connected").default(true),
  login_provider: loginProviderEnum("login_provider").default("replit_auth"),
  contractor_affiliation_id: varchar("contractor_affiliation_id"),
  foreman_activated: boolean("foreman_activated").default(false),
  last_known_lat: numeric("last_known_lat"),
  last_known_lng: numeric("last_known_lng"),
  last_location_updated_at: timestamp("last_location_updated_at"),
  privacy_policy_version_accepted: text("privacy_policy_version_accepted"),
  privacy_policy_accepted_at: timestamp("privacy_policy_accepted_at"),
  preferred_material_unit: text("preferred_material_unit").default("tons"),
  is_suspended: boolean("is_suspended").default(false),
  suspended_at: timestamp("suspended_at"),
  suspend_reason: text("suspend_reason"),
  suspended_by: varchar("suspended_by"),
  is_admin: boolean("is_admin").default(false),
  expo_push_token: text("expo_push_token")
});
var jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractor_id: varchar("contractor_id").references(() => users.id),
  driver_id: varchar("driver_id").references(() => users.id),
  material: text("material"),
  origin_address: text("origin_address"),
  destination_address: text("destination_address"),
  distance: numeric("distance", { precision: 5, scale: 2 }),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  rate_type: text("rate_type").default("flat_rate"),
  truck_type: truckTypeEnum("truck_type"),
  status: jobStatusEnum("status").default("open"),
  urgent: boolean("urgent").default(false),
  paperwork_description: text("paperwork_description"),
  scheduled_date: timestamp("scheduled_date"),
  completed_date: timestamp("completed_date"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at"),
  pickup_time: text("pickup_time"),
  arrival_time: timestamp("arrival_time"),
  payment_status: paymentStatusEnum("payment_status").default("unpaid"),
  invoice_id: varchar("invoice_id"),
  capacity_needed: text("capacity_needed"),
  project_id: varchar("project_id"),
  estimated_duration_minutes: integer("estimated_duration_minutes"),
  origin_lat: numeric("origin_lat", { precision: 10, scale: 7 }),
  origin_lng: numeric("origin_lng", { precision: 10, scale: 7 }),
  destination_lat: numeric("destination_lat", { precision: 10, scale: 7 }),
  destination_lng: numeric("destination_lng", { precision: 10, scale: 7 }),
  vehicle_id: varchar("vehicle_id"),
  job_type: text("job_type").default("single_load"),
  total_tons_needed: numeric("total_tons_needed", { precision: 10, scale: 2 }),
  trucks_needed: integer("trucks_needed"),
  load_time_minutes: integer("load_time_minutes").default(15),
  unload_time_minutes: integer("unload_time_minutes").default(10),
  adjusted_trip_minutes: integer("adjusted_trip_minutes"),
  estimated_total_minutes: integer("estimated_total_minutes"),
  estimated_days: numeric("estimated_days", { precision: 4, scale: 1 }),
  estimated_trips: integer("estimated_trips"),
  listed_days: numeric("listed_days", { precision: 4, scale: 1 }),
  includes_weekends: boolean("includes_weekends").default(false),
  estimated_cost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  cancelled_at: timestamp("cancelled_at"),
  requires_weight_tickets: boolean("requires_weight_tickets").default(false),
  total_amount_unit: text("total_amount_unit").default("tons"),
  original_rate: numeric("original_rate", { precision: 10, scale: 2 }),
  original_rate_type: text("original_rate_type"),
  requires_tarp: boolean("requires_tarp").default(false)
});
var jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  job_id: varchar("job_id").references(() => jobs.id),
  driver_id: varchar("driver_id").references(() => users.id),
  status: jobRunStatusEnum("status").default("active"),
  started_at: timestamp("started_at").defaultNow(),
  ended_at: timestamp("ended_at"),
  start_lat: numeric("start_lat", { precision: 10, scale: 7 }),
  start_lng: numeric("start_lng", { precision: 10, scale: 7 }),
  end_lat: numeric("end_lat", { precision: 10, scale: 7 }),
  end_lng: numeric("end_lng", { precision: 10, scale: 7 }),
  actual_duration_minutes: integer("actual_duration_minutes"),
  billed_duration_minutes: integer("billed_duration_minutes"),
  total_miles: numeric("total_miles", { precision: 8, scale: 2 }),
  loads_hauled: integer("loads_hauled"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at")
});
var notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").references(() => users.id),
  type: notificationTypeEnum("type"),
  title: text("title"),
  message: text("message"),
  job_id: varchar("job_id").references(() => jobs.id),
  is_read: boolean("is_read").default(false),
  created_at: timestamp("created_at").defaultNow()
});
var jobMessages = pgTable("job_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  job_id: varchar("job_id"),
  sender_id: varchar("sender_id"),
  body: text("body"),
  read: boolean("read").default(false),
  created_at: timestamp("created_at").defaultNow()
});
var driverAvailability = pgTable("driver_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driver_id: varchar("driver_id"),
  date: timestamp("date"),
  start_time: text("start_time"),
  end_time: text("end_time"),
  recurrence: recurrenceTypeEnum("recurrence").default("none"),
  day_of_week: integer("day_of_week"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at"),
  is_available: boolean("is_available").default(true),
  job_id: varchar("job_id").references(() => jobs.id),
  commitment_type: text("commitment_type"),
  commitment_company_name: text("commitment_company_name"),
  vehicle_id: varchar("vehicle_id")
});
var monthlyInvoices = pgTable("monthly_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoice_number: text("invoice_number").unique(),
  contractor_id: varchar("contractor_id").references(() => users.id),
  driver_id: varchar("driver_id").references(() => users.id),
  period_month: timestamp("period_month"),
  period_label: text("period_label"),
  total_amount: numeric("total_amount", { precision: 12, scale: 2 }).default("0"),
  job_count: integer("job_count").default(0),
  status: invoiceStatusEnum("status").default("open"),
  issued_at: timestamp("issued_at"),
  due_date: timestamp("due_date"),
  paid_at: timestamp("paid_at"),
  contractor_snapshot: jsonb("contractor_snapshot"),
  driver_snapshot: jsonb("driver_snapshot"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at")
});
var driverVehicles = pgTable("driver_vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driver_id: varchar("driver_id").references(() => users.id),
  truck_type: truckTypeEnum("truck_type"),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  license_plate: text("license_plate"),
  vin_number: text("vin_number"),
  is_active: boolean("is_active").default(true),
  issue_notes: text("issue_notes"),
  is_primary: boolean("is_primary").default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at"),
  max_capacity_tons: numeric("max_capacity_tons", { precision: 10, scale: 2 }),
  truck_number: text("truck_number"),
  assigned_driver_id: varchar("assigned_driver_id").references(() => users.id)
});
var sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull()
});
var jobAssignments = pgTable("job_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  job_id: varchar("job_id").references(() => jobs.id),
  driver_id: varchar("driver_id").references(() => users.id),
  vehicle_id: varchar("vehicle_id").references(() => driverVehicles.id),
  status: text("status").default("pending"),
  accepted_at: timestamp("accepted_at").defaultNow(),
  approved_at: timestamp("approved_at"),
  created_at: timestamp("created_at").defaultNow(),
  fleet_truck_id: varchar("fleet_truck_id"),
  available_days: integer("available_days")
});
var contractorProjects = pgTable("contractor_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractor_id: varchar("contractor_id").references(() => users.id),
  name: text("name"),
  job_number: text("job_number"),
  awarded_amount: numeric("awarded_amount"),
  status: text("status").default("active"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  site_address: text("site_address"),
  site_lat: numeric("site_lat"),
  site_lng: numeric("site_lng"),
  site_address_type: text("site_address_type").default("dropoff"),
  deleted_at: timestamp("deleted_at")
});
var reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  job_id: varchar("job_id").references(() => jobs.id),
  reviewer_id: varchar("reviewer_id").references(() => users.id),
  reviewee_id: varchar("reviewee_id").references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  reviewer_role: text("reviewer_role"),
  created_at: timestamp("created_at").defaultNow()
});
var contractorFavoriteDrivers = pgTable("contractor_favorite_drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractor_id: varchar("contractor_id").references(() => users.id),
  driver_id: varchar("driver_id").references(() => users.id),
  created_at: timestamp("created_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var weightTickets = pgTable("weight_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  job_run_id: varchar("job_run_id").references(() => jobRuns.id),
  job_id: varchar("job_id").references(() => jobs.id),
  driver_id: varchar("driver_id").references(() => users.id),
  image_data: text("image_data"),
  weight_value: varchar("weight_value"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow()
});
var conversationActions = pgTable("conversation_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").references(() => users.id),
  job_id: varchar("job_id").references(() => jobs.id),
  action: varchar("action", { length: 20 }),
  created_at: timestamp("created_at").defaultNow()
});

// server/db.ts
var connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
var isNeonOrExternal = connectionString?.includes("neon.tech") || connectionString?.includes("amazonaws.com");
var poolConfig = {
  connectionString,
  ...isNeonOrExternal ? { ssl: { rejectUnauthorized: false } } : {},
  max: 10,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4
};
var pool = new Pool(poolConfig);
pool.on("error", (err) => {
  console.error("Pool error (will reconnect):", err.message);
});
var db = drizzle(pool, { schema: schema_exports });

// server/sync.ts
var WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlink.replit.app";
var WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";
async function websiteFetchSync(path2, options = {}) {
  const url = new URL(path2, WEBSITE_API_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== void 0 && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }
  const headers = {
    "X-API-Key": WEBSITE_API_KEY,
    "Content-Type": "application/json"
  };
  if (options.jwt) headers["Authorization"] = `Bearer ${options.jwt}`;
  const fetchOpts = { method: options.method || "GET", headers };
  if (options.body && options.method !== "GET") fetchOpts.body = JSON.stringify(options.body);
  const res = await fetch(url.toString(), fetchOpts);
  if (!res.ok) {
    const ct2 = res.headers.get("content-type") || "";
    if (ct2.includes("application/json")) {
      return null;
    }
    return null;
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return res.json();
}
var hiddenJobIds = /* @__PURE__ */ new Set([
  "71a89320-160a-40c4-9967-1b2e8db25942",
  "37cdee04-1606-4bbb-88c2-b51dd5e7e6c2",
  "b0067804-b81d-4ef0-902b-a7ec32e170f7",
  "fb353d76-e763-402b-990c-1498abee7904",
  "70eb099c-5499-4877-b33d-1db79bc060b4",
  "119aa6fa-6a7c-4a4a-802f-3343fa1f6ed0",
  "a9fc2cbc-3df6-4c68-9e00-137a8730e191",
  "d56e9fda-118a-464a-a85e-3e0f4b59cb97",
  "cead455d-8870-4465-8d7e-cd4591f1c714",
  "df66e51e-0dc8-451e-bd25-a8812ab7e261",
  "a8194fd8-df25-4e62-8852-204e6c9a834a",
  "9b4c1fef-1c8c-4b08-a86a-30c569073fb0",
  "9acd4492-b2c6-41d6-9a4b-f3fbb2d0a8ee",
  "4c3c7262-f8c6-4dd3-918d-621db4010b42",
  "1ddadca8-4555-4f5d-af3c-8be2bd3faed4",
  "e10d2ecb-142e-4db2-8704-4e8c82fad225",
  "5242f9a5-f65e-459c-b4aa-57e2ba2df478",
  "b6a22aec-1b61-43a8-b041-9e7d92531349",
  "260669a8-564b-4711-82af-dfc57daf65ed",
  "996c08da-c1ee-4863-a811-d29565e19625",
  "eec5123e-70d0-43f9-a0f0-1471d52e61e9"
]);
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
function normalizeToSnake(obj) {
  if (!obj || typeof obj !== "object") return {};
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[camelToSnake(key)] = val;
  }
  return result;
}
async function getTableColumns(tableName) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [tableName]
  );
  return new Set(result.rows.map((r) => r.column_name));
}
var _columnCache = /* @__PURE__ */ new Map();
async function getCachedColumns(tableName) {
  if (!_columnCache.has(tableName)) {
    _columnCache.set(tableName, await getTableColumns(tableName));
  }
  return _columnCache.get(tableName);
}
async function upsertRow(tableName, data, idField = "id") {
  const columns = await getCachedColumns(tableName);
  const normalized = normalizeToSnake(data);
  const filteredEntries = Object.entries(normalized).filter(
    ([key, val]) => columns.has(key) && val !== void 0
  );
  if (filteredEntries.length === 0 || !normalized[idField]) return;
  const keys = filteredEntries.map(([k]) => k);
  const values = filteredEntries.map(([, v]) => v);
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const updateClauses = keys.filter((k) => k !== idField).map((k) => `${k} = EXCLUDED.${k}`);
  if (updateClauses.length === 0) {
    const sql2 = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO NOTHING`;
    await pool.query(sql2, values);
  } else {
    const sql2 = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO UPDATE SET ${updateClauses.join(", ")}`;
    await pool.query(sql2, values);
  }
}
async function upsertMany(tableName, rows, idField = "id") {
  let count = 0;
  for (const row of rows) {
    try {
      await upsertRow(tableName, row, idField);
      count++;
    } catch (e) {
      console.error(`Sync upsert ${tableName} error:`, e.message?.slice(0, 120));
    }
  }
  return count;
}
async function updateSyncTime(entityType, userId) {
  await pool.query(
    `INSERT INTO sync_metadata (entity_type, last_synced_at, user_id) VALUES ($1, NOW(), $2) ON CONFLICT (entity_type) DO UPDATE SET last_synced_at = NOW(), user_id = $2`,
    [entityType, userId]
  );
}
async function syncJobs(auth) {
  try {
    const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
    if (!Array.isArray(allJobs)) return 0;
    const jobs2 = allJobs.filter((j) => j.id && !hiddenJobIds.has(j.id));
    const count = await upsertMany("jobs", jobs2);
    const projectMap = /* @__PURE__ */ new Map();
    for (const j of jobs2) {
      const pId = j.projectId || j.project_id;
      const pName = j.projectName || j.project_name;
      const cId = j.contractorId || j.contractor_id;
      if (pId && pName) {
        projectMap.set(pId, {
          id: pId,
          name: pName,
          contractor_id: cId,
          status: "active"
        });
      }
    }
    await updateSyncTime("jobs", auth.userId);
    return count;
  } catch (e) {
    console.error("syncJobs error:", e.message);
    return 0;
  }
}
async function syncProjects(auth) {
  try {
    let projects = [];
    const websiteProjects = await websiteFetchSync("/api/projects", { jwt: auth.jwt });
    if (Array.isArray(websiteProjects) && websiteProjects.length > 0) {
      projects = websiteProjects;
    }
    if (projects.length === 0) {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      if (Array.isArray(allJobs)) {
        const projectMap = /* @__PURE__ */ new Map();
        for (const j of allJobs.filter((j2) => !hiddenJobIds.has(j2.id))) {
          const pId = j.projectId || j.project_id;
          const pName = j.projectName || j.project_name;
          const cId = j.contractorId || j.contractor_id;
          if (pId && pName) {
            projectMap.set(pId, {
              id: pId,
              name: pName,
              contractor_id: cId || auth.userId,
              status: "active"
            });
          }
        }
        projects = [...projectMap.values()];
      }
    }
    const count = await upsertMany("contractor_projects", projects);
    await updateSyncTime("projects", auth.userId);
    return count;
  } catch (e) {
    console.error("syncProjects error:", e.message);
    return 0;
  }
}
async function syncJobAssignments(auth) {
  try {
    const data = await websiteFetchSync("/api/assignments", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("job_assignments", data);
    await updateSyncTime("job_assignments", auth.userId);
    return count;
  } catch (e) {
    console.error("syncJobAssignments error:", e.message);
    return 0;
  }
}
async function syncVehicles(auth) {
  try {
    const data = await websiteFetchSync("/api/vehicles", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const mapped = data.map((v) => ({
      ...v,
      trucking_company_id: v.trucking_company_id || v.truckingCompanyId || v.driver_id || v.driverId || auth.userId
    }));
    const count = await upsertMany("trucks", mapped);
    await updateSyncTime("vehicles", auth.userId);
    return count;
  } catch (e) {
    console.error("syncVehicles error:", e.message);
    return 0;
  }
}
async function syncAvailability(auth) {
  try {
    const data = await websiteFetchSync("/api/availability", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("driver_availability", data);
    await updateSyncTime("availability", auth.userId);
    return count;
  } catch (e) {
    console.error("syncAvailability error:", e.message);
    return 0;
  }
}
async function syncInvoices(auth) {
  try {
    const data = await websiteFetchSync("/api/invoices", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("monthly_invoices", data);
    await updateSyncTime("invoices", auth.userId);
    return count;
  } catch (e) {
    console.error("syncInvoices error:", e.message);
    return 0;
  }
}
async function syncNotifications(auth) {
  try {
    const data = await websiteFetchSync("/api/notifications", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("notifications", data);
    await updateSyncTime("notifications", auth.userId);
    return count;
  } catch (e) {
    console.error("syncNotifications error:", e.message);
    return 0;
  }
}
async function syncUser(auth) {
  try {
    if (auth.user && auth.user.id) {
      await upsertRow("users", auth.user);
    }
  } catch (e) {
    console.error("syncUser error:", e.message);
  }
}
async function fullSync(auth) {
  const t0 = Date.now();
  console.log(`[Sync] Starting full sync for user ${auth.userId}...`);
  await syncUser(auth);
  const [jobs2, projects, assignments, vehicles] = await Promise.allSettled([
    syncJobs(auth),
    syncProjects(auth),
    syncJobAssignments(auth),
    syncVehicles(auth)
  ]);
  Promise.allSettled([
    syncAvailability(auth),
    syncInvoices(auth),
    syncNotifications(auth)
  ]).catch(() => {
  });
  const result = {
    jobs: jobs2.status === "fulfilled" ? jobs2.value : 0,
    projects: projects.status === "fulfilled" ? projects.value : 0,
    assignments: assignments.status === "fulfilled" ? assignments.value : 0,
    vehicles: vehicles.status === "fulfilled" ? vehicles.value : 0
  };
  console.log(`[Sync] Full sync complete in ${Date.now() - t0}ms: ${JSON.stringify(result)}`);
  return result;
}
async function pushToWebsite(path2, auth, options = {}) {
  try {
    const result = await websiteFetchSync(path2, {
      method: options.method || "POST",
      body: options.body,
      jwt: auth.jwt
    });
    return result;
  } catch (e) {
    console.error(`[Sync] Push to website failed: ${path2}`, e.message);
    return null;
  }
}
var _syncTimers = /* @__PURE__ */ new Map();
var _lastUserActivity = /* @__PURE__ */ new Map();
function recordUserActivity(userId) {
  _lastUserActivity.set(userId, Date.now());
}
function startPeriodicSync(getActiveAuths, intervalMs = 6e4) {
  if (_syncTimers.has("periodic")) {
    clearInterval(_syncTimers.get("periodic"));
  }
  const timer = setInterval(async () => {
    const auths = getActiveAuths();
    if (auths.length === 0) return;
    const recentlyActive = auths.filter((a) => {
      const lastActive = _lastUserActivity.get(a.userId);
      return lastActive && Date.now() - lastActive < 3e5;
    }).slice(0, 2);
    if (recentlyActive.length === 0) return;
    for (const auth of recentlyActive) {
      try {
        await fullSync(auth);
      } catch (e) {
        console.error(`[Sync] Periodic sync failed for ${auth.userId}:`, e.message);
      }
    }
  }, intervalMs);
  _syncTimers.set("periodic", timer);
  console.log(`[Sync] Periodic sync started (every ${intervalMs / 1e3}s)`);
}

// server/routes.ts
var WEBSITE_API_URL2 = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlink.replit.app";
var WEBSITE_API_KEY2 = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";
var DATA_DIR = join(process.cwd(), ".data");
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
}
function loadJsonMap(filename) {
  try {
    const raw = readFileSync(join(DATA_DIR, filename), "utf-8");
    const entries = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function saveJsonMap(filename, map) {
  try {
    if (map.size > 200) {
      const entries = [...map.entries()];
      const trimmed = entries.slice(entries.length - 200);
      map.clear();
      for (const [k, v] of trimmed) map.set(k, v);
    }
    writeFileSync(join(DATA_DIR, filename), JSON.stringify([...map.entries()]), "utf-8");
  } catch {
  }
}
var tokenToJwt = loadJsonMap("sessions.json");
var hiddenJobIds2 = /* @__PURE__ */ new Set([
  "71a89320-160a-40c4-9967-1b2e8db25942",
  "37cdee04-1606-4bbb-88c2-b51dd5e7e6c2",
  "b0067804-b81d-4ef0-902b-a7ec32e170f7",
  "fb353d76-e763-402b-990c-1498abee7904",
  "70eb099c-5499-4877-b33d-1db79bc060b4",
  "119aa6fa-6a7c-4a4a-802f-3343fa1f6ed0",
  "a9fc2cbc-3df6-4c68-9e00-137a8730e191",
  "d56e9fda-118a-464a-a85e-3e0f4b59cb97",
  "cead455d-8870-4465-8d7e-cd4591f1c714",
  "df66e51e-0dc8-451e-bd25-a8812ab7e261",
  "a8194fd8-df25-4e62-8852-204e6c9a834a",
  "9b4c1fef-1c8c-4b08-a86a-30c569073fb0",
  "9acd4492-b2c6-41d6-9a4b-f3fbb2d0a8ee",
  "4c3c7262-f8c6-4dd3-918d-621db4010b42",
  "1ddadca8-4555-4f5d-af3c-8be2bd3faed4",
  "e10d2ecb-142e-4db2-8704-4e8c82fad225",
  "5242f9a5-f65e-459c-b4aa-57e2ba2df478",
  "b6a22aec-1b61-43a8-b041-9e7d92531349",
  "260669a8-564b-4711-82af-dfc57daf65ed",
  "996c08da-c1ee-4863-a811-d29565e19625",
  "eec5123e-70d0-43f9-a0f0-1471d52e61e9"
]);
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnake2(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
function addDualKeys(obj) {
  if (Array.isArray(obj)) return obj.map(addDualKeys);
  if (obj === null || typeof obj !== "object") return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const val = addDualKeys(obj[key]);
    result[key] = val;
    const snake = camelToSnake2(key);
    const camel = snakeToCamel(key);
    if (snake !== key) result[snake] = val;
    if (camel !== key) result[camel] = val;
  }
  return result;
}
function getWebsiteAuth(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return tokenToJwt.get(token) || null;
  }
  return null;
}
async function websiteFetch(path2, options = {}) {
  const url = new URL(path2, WEBSITE_API_URL2);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== void 0 && v !== null && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }
  const headers = {
    "X-API-Key": WEBSITE_API_KEY2,
    "Content-Type": "application/json"
  };
  if (options.jwt) {
    headers["Authorization"] = `Bearer ${options.jwt}`;
  }
  const fetchOpts = {
    method: options.method || "GET",
    headers
  };
  if (options.body && options.method !== "GET") {
    fetchOpts.body = JSON.stringify(options.body);
  }
  return fetch(url.toString(), fetchOpts);
}
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round(totalSeconds % 3600 / 60);
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${minutes} min`;
}
async function registerRoutes(app2) {
  function requireAuth(req, res, next) {
    const auth = getWebsiteAuth(req);
    if (auth) {
      req.userId = auth.userId;
      req.websiteJwt = auth.jwt;
      recordUserActivity(auth.userId);
      return next();
    }
    return res.status(401).json({ message: "Not authenticated" });
  }
  app2.post("/api/auth/social-login", async (req, res) => {
    try {
      const { provider, token, email: clientEmail } = req.body;
      if (!provider || !token) {
        return res.status(400).json({ message: "Provider and token are required" });
      }
      let verifiedEmail = null;
      if (provider === "google") {
        try {
          const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
          if (googleRes.ok) {
            const info = await googleRes.json();
            if (info.email_verified === "true" || info.email_verified === true) {
              verifiedEmail = info.email;
            }
          }
          if (!verifiedEmail) {
            const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (userinfoRes.ok) {
              const info = await userinfoRes.json();
              if (info.email_verified) {
                verifiedEmail = info.email;
              }
            }
          }
        } catch (e) {
          console.error("Google token verification failed:", e.message);
        }
      } else if (provider === "apple") {
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
            if (payload.iss === "https://appleid.apple.com" && payload.email) {
              verifiedEmail = payload.email;
            }
          }
        } catch (e) {
          console.error("Apple token decode failed:", e.message);
        }
        if (!verifiedEmail && clientEmail) {
          verifiedEmail = clientEmail;
        }
      }
      if (!verifiedEmail) {
        return res.status(401).json({ message: "Could not verify your identity. Please try again." });
      }
      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email: verifiedEmail }
      });
      const data = await websiteRes.json();
      if (!websiteRes.ok) {
        if (websiteRes.status === 404 || data.message && data.message.toLowerCase().includes("not found")) {
          return res.status(404).json({
            message: "No LoadLink account found with this email. Please sign up first on loadlink.replit.app",
            email: verifiedEmail
          });
        }
        return res.status(websiteRes.status).json({
          message: data.message || data.error || "Authentication failed"
        });
      }
      const jwt = data.token;
      const user = data.user;
      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }
      const localToken = __require("crypto").randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);
      const enrichedUser = addDualKeys(user);
      res.json({ token: localToken, user: enrichedUser });
      fullSync(authEntry).catch(() => {
      });
      return;
    } catch (err) {
      console.error("Social login error:", err.message);
      return res.status(500).json({ message: "Authentication service unavailable" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      for (const [existingToken, session] of tokenToJwt.entries()) {
        if (session.user?.email?.toLowerCase() === email.toLowerCase()) {
          const localToken2 = __require("crypto").randomBytes(32).toString("hex");
          tokenToJwt.set(localToken2, session);
          saveJsonMap("sessions.json", tokenToJwt);
          recordUserActivity(session.userId);
          res.json({ token: localToken2, user: addDualKeys(session.user) });
          websiteFetch("/api/companion/auth/login", {
            method: "POST",
            body: { email }
          }).then(async (r) => {
            if (r.ok) {
              const d = await r.json();
              if (d.token && d.user) {
                const updated = { jwt: d.token, userId: d.user.id, user: d.user };
                tokenToJwt.set(localToken2, updated);
                saveJsonMap("sessions.json", tokenToJwt);
                fullSync(updated).catch(() => {
                });
              }
            }
          }).catch(() => {
          });
          return;
        }
      }
      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email }
      });
      const data = await websiteRes.json();
      if (!websiteRes.ok) {
        return res.status(websiteRes.status).json({
          message: data.message || data.error || "Invalid credentials"
        });
      }
      const jwt = data.token;
      const user = data.user;
      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }
      const localToken = __require("crypto").randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);
      const enrichedUser = addDualKeys(user);
      res.json({ token: localToken, user: enrichedUser });
      fullSync(authEntry).catch(() => {
      });
      return;
    } catch (err) {
      console.error("Login error:", err.message);
      return res.status(500).json({ message: "Authentication service unavailable" });
    }
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const websiteRes = await websiteFetch("/api/companion/auth/register", {
        method: "POST",
        body: req.body
      });
      const data = await websiteRes.json();
      if (!websiteRes.ok) {
        return res.status(websiteRes.status).json(data);
      }
      const jwt = data.token;
      const user = data.user;
      if (jwt && user) {
        const localToken = __require("crypto").randomBytes(32).toString("hex");
        tokenToJwt.set(localToken, { jwt, userId: user.id, user });
        saveJsonMap("sessions.json", tokenToJwt);
        return res.json({ token: localToken, user: addDualKeys(user) });
      }
      return res.json(addDualKeys(data));
    } catch (err) {
      console.error("Register error:", err.message);
      return res.status(500).json({ message: "Registration service unavailable" });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      tokenToJwt.delete(authHeader.slice(7));
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json({ ok: true });
  });
  app2.get("/api/auth/me", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    return res.json({ user: addDualKeys(auth.user) });
  });
  app2.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/forgot-password", {
        method: "POST",
        body: req.body
      });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.json({ message: "If an account exists with that email, a reset link has been sent." });
    }
  });
  app2.post("/api/auth/reset-password", async (req, res) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/reset-password", {
        method: "POST",
        body: req.body
      });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/auth/set-password", requireAuth, async (req, res) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/set-password", { method: "POST", body: req.body, jwt: getWebsiteAuth(req)?.jwt });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.status(500).json({ message: "Service unavailable" });
    }
  });
  app2.post("/api/push/register", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { token, expoPushToken, expo_push_token } = req.body;
      const pushToken = token || expoPushToken || expo_push_token;
      if (pushToken) {
        await pool.query(`UPDATE users SET expo_push_token = $1 WHERE id = $2`, [pushToken, auth.userId]);
      }
      pushToWebsite("/api/push/subscribe", auth, { method: "POST", body: req.body }).catch(() => {
      });
    } catch {
    }
    return res.json({ ok: true });
  });
  app2.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const startDate = req.query.start_date;
      const endDate = req.query.end_date;
      const status = req.query.status;
      const search = req.query.search;
      const driverId = req.query.driver_id;
      let query = `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE 1=1`;
      const params = [];
      let paramIdx = 1;
      if (hiddenJobIds2.size > 0) {
        query += ` AND j.id NOT IN (${[...hiddenJobIds2].map((_, i) => `$${paramIdx + i}`).join(",")})`;
        params.push(...hiddenJobIds2);
        paramIdx += hiddenJobIds2.size;
      }
      if (startDate) {
        query += ` AND (j.scheduled_date >= $${paramIdx} OR j.created_at >= $${paramIdx})`;
        params.push(new Date(startDate));
        paramIdx++;
      }
      if (endDate) {
        query += ` AND (j.scheduled_date <= $${paramIdx} OR j.created_at <= $${paramIdx})`;
        params.push(new Date(endDate));
        paramIdx++;
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === "in_progress" || statusLower === "active") {
          query += ` AND LOWER(j.status::text) IN ('in_progress', 'accepted', 'assigned')`;
        } else {
          query += ` AND LOWER(j.status::text) = LOWER($${paramIdx})`;
          params.push(status);
          paramIdx++;
        }
      }
      if (driverId) {
        query += ` AND (j.driver_id = $${paramIdx} OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $${paramIdx}))`;
        params.push(driverId);
        paramIdx++;
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      query += ` ORDER BY j.created_at DESC`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/jobs local error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
        const assignResult = await pool.query(`SELECT * FROM job_assignments WHERE job_id = $1`, [req.params.id]);
        const runsResult = await pool.query(`SELECT * FROM job_runs WHERE job_id = $1 ORDER BY created_at DESC`, [req.params.id]);
        const weightResult = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1`, [req.params.id]);
        job.assignments = assignResult.rows.map(addDualKeys);
        job.jobRuns = runsResult.rows.map(addDualKeys);
        job.job_runs = job.jobRuns;
        job.weightTickets = weightResult.rows.map(addDualKeys);
        job.weight_tickets = job.weightTickets;
        return res.json(addDualKeys(job));
      }
      return res.status(404).json({ message: "Job not found" });
    } catch (e) {
      console.error("GET /api/jobs/:id error:", e.message);
      return res.status(500).json({ message: "Failed to load job" });
    }
  });
  app2.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const body = { ...req.body, id, contractor_id: auth.userId, status: "open", created_at: (/* @__PURE__ */ new Date()).toISOString() };
      const columns = [
        "id",
        "contractor_id",
        "material",
        "origin_address",
        "destination_address",
        "rate",
        "rate_type",
        "truck_type",
        "status",
        "scheduled_date",
        "project_id",
        "trucks_needed",
        "estimated_days",
        "includes_weekends",
        "estimated_cost",
        "origin_lat",
        "origin_lng",
        "destination_lat",
        "destination_lng",
        "job_type",
        "requires_weight_tickets",
        "requires_tarp",
        "urgent",
        "created_at",
        "updated_at"
      ];
      const snakeBody = {};
      for (const [k, v] of Object.entries(body)) {
        snakeBody[camelToSnake2(k)] = v;
      }
      snakeBody.id = id;
      snakeBody.contractor_id = auth.userId;
      snakeBody.status = snakeBody.status || "open";
      snakeBody.created_at = snakeBody.created_at || (/* @__PURE__ */ new Date()).toISOString();
      snakeBody.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      const validCols = columns.filter((c) => snakeBody[c] !== void 0);
      const vals = validCols.map((c) => snakeBody[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      await pool.query(`INSERT INTO jobs (${validCols.join(", ")}) VALUES (${placeholders.join(", ")})`, vals);
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
      const job = result.rows[0] || { id, ...snakeBody };
      pushToWebsite("/api/jobs", auth, { method: "POST", body: req.body }).catch(() => {
      });
      return res.status(201).json(addDualKeys(job));
    } catch (e) {
      console.error("POST /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });
  app2.put("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== void 0) {
          const col = camelToSnake2(k);
          updates.push(`${col} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(`UPDATE jobs SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      return res.json(addDualKeys(result.rows[0] || { id: req.params.id }));
    } catch (e) {
      console.error("PUT /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to update job" });
    }
  });
  app2.delete("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      hiddenJobIds2.add(req.params.id);
      await pool.query(`UPDATE jobs SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req);
      pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "DELETE" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/jobs/:id/accept", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`UPDATE jobs SET status = 'assigned', driver_id = $1, updated_at = NOW() WHERE id = $2`, [auth.userId, req.params.id]);
      const id = __require("crypto").randomUUID();
      await pool.query(
        `INSERT INTO job_assignments (id, job_id, driver_id, status, created_at) VALUES ($1, $2, $3, 'accepted', NOW()) ON CONFLICT DO NOTHING`,
        [id, req.params.id, auth.userId]
      );
      pushToWebsite(`/api/jobs/${req.params.id}/accept`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.id, status: "assigned" }));
    } catch (e) {
      console.error("Accept job error:", e.message);
      return res.status(500).json({ message: "Failed to accept job" });
    }
  });
  app2.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ja.*, j.scheduled_date, j.estimated_days FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.vehicle_id IS NOT NULL AND ja.job_id != $1
         AND j.status IN ('open', 'in_progress', 'assigned', 'pending')`,
        [req.params.id]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/jobs/:id/counter-bid", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { rate, note } = req.body;
      const id = __require("crypto").randomUUID();
      await pool.query(
        `INSERT INTO job_assignments (id, job_id, driver_id, status, counter_bid_rate, counter_bid_note, created_at)
         VALUES ($1, $2, $3, 'counter_bid', $4, $5, NOW()) ON CONFLICT DO NOTHING`,
        [id, req.params.id, auth.userId, rate, note]
      );
      pushToWebsite(`/api/jobs/${req.params.id}/counter-bid`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Counter bid error:", e.message);
      return res.status(500).json({ message: "Failed to submit counter bid" });
    }
  });
  app2.post("/api/jobs/:id/withdraw", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`DELETE FROM job_assignments WHERE job_id = $1 AND driver_id = $2`, [req.params.id, auth.userId]);
      pushToWebsite(`/api/jobs/${req.params.id}/withdraw`, auth, { method: "POST" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM job_assignments WHERE id = $1`, [req.params.assignmentId]);
      const auth = getWebsiteAuth(req);
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}`, auth, { method: "DELETE" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/cleanup-duplicate-assignments", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM job_assignments WHERE id NOT IN (SELECT MIN(id) FROM job_assignments GROUP BY job_id, driver_id)`);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.get("/api/jobs/:id/assignments", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ja.*, u.full_name as driver_name, u.phone as driver_phone, u.truck_type as driver_truck_type, u.rating as driver_rating
         FROM job_assignments ja LEFT JOIN users u ON ja.driver_id = u.id WHERE ja.job_id = $1`,
        [req.params.id]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE id = $1`, [req.params.assignmentId]);
      await pool.query(`UPDATE jobs SET status = 'assigned', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Approve assignment error:", e.message);
      return res.status(500).json({ message: "Failed to approve" });
    }
  });
  app2.post("/api/jobs/:id/assignments/:assignmentId/reject", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`UPDATE job_assignments SET status = 'rejected' WHERE id = $1`, [req.params.assignmentId]);
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/reject`, auth, { method: "POST" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      await pool.query(`UPDATE job_assignments SET vehicle_id = $1 WHERE id = $2`, [vid, req.params.assignmentId]);
      pushToWebsite(`/api/assignments/${req.params.assignmentId}/vehicle`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to assign vehicle" });
    }
  });
  app2.post("/api/jobs/:id/clock-in", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const runId = __require("crypto").randomUUID();
      await pool.query(
        `INSERT INTO job_runs (id, job_id, driver_id, status, started_at, created_at) VALUES ($1, $2, $3, 'in_progress', NOW(), NOW())`,
        [runId, req.params.id, auth.userId]
      );
      await pool.query(`UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}/clock-in`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [runId]);
      return res.json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("Clock-in error:", e.message);
      return res.status(500).json({ message: "Failed to clock in" });
    }
  });
  app2.post("/api/job-runs/:runId/clock-out", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.runId]);
      pushToWebsite(`/api/job-runs/${req.params.runId}/clock-out`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch (e) {
      console.error("Clock-out error:", e.message);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });
  app2.patch("/api/job-runs/:runId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== void 0) {
          updates.push(`${camelToSnake2(k)} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.runId);
        await pool.query(`UPDATE job_runs SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
      pushToWebsite(`/api/job-runs/${req.params.runId}`, auth, { method: "PATCH", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch {
      return res.status(500).json({ message: "Failed to update job run" });
    }
  });
  app2.delete("/api/job-runs/:runId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`DELETE FROM job_runs WHERE id = $1`, [req.params.runId]);
      pushToWebsite(`/api/job-runs/${req.params.runId}`, auth, { method: "DELETE" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const runResult = await pool.query(`SELECT job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      const jobId = runResult.rows[0]?.job_id || null;
      await pool.query(
        `INSERT INTO weight_tickets (id, job_run_id, job_id, driver_id, weight_value, notes, image_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data]
      );
      pushToWebsite(`/api/job-runs/${req.params.runId}/weight-tickets`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("Weight ticket error:", e.message);
      return res.status(500).json({ message: "Failed to add weight ticket" });
    }
  });
  app2.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1 ORDER BY created_at`, [req.params.jobId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_run_id = $1 ORDER BY created_at`, [req.params.runId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT jm.job_id, j.material, j.origin_address, j.destination_address, j.status as job_status,
                j.contractor_id, j.driver_id,
                MAX(jm.created_at) as last_message_at,
                COUNT(CASE WHEN jm.read = false AND jm.sender_id != $1 THEN 1 END)::int as unread_count,
                (SELECT body FROM job_messages WHERE job_id = jm.job_id ORDER BY created_at DESC LIMIT 1) as last_message
         FROM job_messages jm
         JOIN jobs j ON jm.job_id = j.id
         WHERE (j.contractor_id = $1 OR j.driver_id = $1)
         GROUP BY jm.job_id, j.material, j.origin_address, j.destination_address, j.status, j.contractor_id, j.driver_id
         ORDER BY MAX(jm.created_at) DESC`,
        [auth.userId]
      );
      const convs = result.rows.filter((c) => !hiddenJobIds2.has(c.job_id));
      return res.json(convs.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/conversations error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/conversations/archived", requireAuth, async (req, res) => {
    return res.json([]);
  });
  app2.post("/api/conversations/:jobId/archive", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    pushToWebsite(`/api/conversations/${req.params.jobId}/archive`, auth, { method: "POST" }).catch(() => {
    });
    return res.json({ ok: true });
  });
  app2.post("/api/conversations/:jobId/unarchive", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    pushToWebsite(`/api/conversations/${req.params.jobId}/unarchive`, auth, { method: "POST" }).catch(() => {
    });
    return res.json({ ok: true });
  });
  app2.post("/api/conversations/:jobId/delete", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM job_messages WHERE job_id = $1`, [req.params.jobId]);
      const auth = getWebsiteAuth(req);
      pushToWebsite(`/api/conversations/${req.params.jobId}/delete`, auth, { method: "POST" }).catch(() => {
      });
    } catch {
    }
    return res.json({ ok: true });
  });
  app2.get("/api/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT COUNT(*)::int as count FROM job_messages jm
         JOIN jobs j ON jm.job_id = j.id
         WHERE jm.read = false AND jm.sender_id != $1
         AND (j.contractor_id = $1 OR j.driver_id = $1)`,
        [auth.userId]
      );
      return res.json({ count: result.rows[0]?.count || 0 });
    } catch {
      return res.json({ count: 0 });
    }
  });
  app2.get("/api/messages/:jobId", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT jm.*, u.full_name as sender_name FROM job_messages jm
         LEFT JOIN users u ON jm.sender_id = u.id
         WHERE jm.job_id = $1 ORDER BY jm.created_at ASC`,
        [req.params.jobId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/messages/:jobId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const body = req.body.body || req.body.message || req.body.content || "";
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [id, req.params.jobId, auth.userId, body]
      );
      pushToWebsite(`/api/messages/${req.params.jobId}`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM job_messages WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST message error:", e.message);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });
  app2.get("/api/profile", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    return res.json(addDualKeys(auth.user));
  });
  app2.put("/api/profile", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    Object.assign(auth.user, req.body);
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== void 0) {
          updates.push(`${camelToSnake2(k)} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(auth.userId);
        await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
    } catch (e) {
      console.log("Profile update DB error:", e?.message);
    }
    pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: req.body }).catch(() => {
    });
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) {
      tokenToJwt.set(localToken, auth);
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json(addDualKeys(auth.user));
  });
  app2.put("/api/profile/status", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { is_connected, isConnected } = req.body;
    const newStatus = is_connected ?? isConnected ?? true;
    auth.user.isConnected = newStatus;
    auth.user.is_connected = newStatus;
    try {
      await pool.query(`UPDATE users SET is_connected = $1, updated_at = NOW() WHERE id = $2`, [newStatus, auth.userId]);
    } catch {
    }
    pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: { is_connected: newStatus } }).catch(() => {
    });
    return res.json(addDualKeys(auth.user));
  });
  app2.put("/api/profile/role", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { role } = req.body;
    if (role) {
      auth.user.role = role;
      try {
        await pool.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [role, auth.userId]);
      } catch {
      }
      pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: { role } }).catch(() => {
      });
    }
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) {
      tokenToJwt.set(localToken, auth);
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json(addDualKeys(auth.user));
  });
  app2.get("/api/drivers/search", requireAuth, async (req, res) => {
    try {
      const search = req.query.q || req.query.search || "";
      let query = `SELECT id, full_name, email, phone, truck_type, rating, total_jobs, profile_image_url, is_connected FROM users WHERE role LIKE '%driver%'`;
      const params = [];
      if (search) {
        query += ` AND (full_name ILIKE $1 OR email ILIKE $1)`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY rating DESC LIMIT 50`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM trucks WHERE trucking_company_id = $1 OR assigned_driver_id = $1 ORDER BY sort_order, created_at`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const b = req.body;
      await pool.query(
        `INSERT INTO trucks (id, trucking_company_id, truck_type, make, model, year, license_plate, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
        [id, auth.userId, b.truckType || b.truck_type, b.make, b.model, b.year, b.licensePlate || b.license_plate]
      );
      pushToWebsite("/api/vehicles", auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to add vehicle" });
    }
  });
  app2.put("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== void 0) {
          updates.push(`${camelToSnake2(k)} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(`UPDATE trucks SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
      pushToWebsite(`/api/vehicles/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch {
      return res.status(500).json({ message: "Failed to update vehicle" });
    }
  });
  app2.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM trucks WHERE id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req);
      pushToWebsite(`/api/vehicles/${req.params.id}`, auth, { method: "DELETE" }).catch(() => {
      });
    } catch {
    }
    return res.json({ ok: true });
  });
  app2.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT j.* FROM jobs j JOIN job_assignments ja ON j.id = ja.job_id WHERE ja.vehicle_id = $1 ORDER BY j.scheduled_date DESC`,
        [req.params.vehicleId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/availability", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(`SELECT * FROM driver_availability WHERE driver_id = $1 ORDER BY date`, [auth.userId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/availability", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const b = req.body;
      await pool.query(
        `INSERT INTO driver_availability (id, driver_id, date, start_time, end_time, is_available, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [id, auth.userId, b.date, b.startTime || b.start_time, b.endTime || b.end_time, b.isAvailable ?? b.is_available ?? true, b.notes]
      );
      pushToWebsite("/api/me/availability", auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM driver_availability WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST availability error:", e.message);
      return res.status(500).json({ message: "Failed to set availability" });
    }
  });
  app2.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [auth.userId]);
      pushToWebsite("/api/notifications/mark-read", auth, { method: "POST" }).catch(() => {
      });
    } catch {
    }
    return res.json({ ok: true });
  });
  app2.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const userId = auth.userId;
      const role = (auth.user?.role || "").toLowerCase();
      const isContractor = role.includes("contractor") || role === "trucking_company";
      const jobsResult = await pool.query(
        isContractor ? `SELECT * FROM jobs WHERE contractor_id = $1 AND status::text != 'cancelled' ORDER BY created_at DESC` : `SELECT * FROM jobs WHERE (driver_id = $1 OR id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1)) AND status::text != 'cancelled' ORDER BY created_at DESC`,
        [userId]
      );
      const jobs2 = jobsResult.rows;
      const openJobs = jobs2.filter((j) => j.status === "open").length;
      const activeJobs = jobs2.filter((j) => ["assigned", "accepted", "in_progress"].includes(j.status)).length;
      const completedJobs = jobs2.filter((j) => j.status === "completed").length;
      const assignResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id WHERE j.contractor_id = $1 AND ja.status = 'pending'`,
        [userId]
      );
      const pendingApplications = assignResult.rows[0]?.count || 0;
      const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      const user = userResult.rows[0];
      const invoicesResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total, COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued') THEN total_amount ELSE 0 END), 0)::float as awaiting FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`,
        [userId]
      );
      const dashboard = {
        openJobs,
        activeJobs,
        completedJobs,
        pendingApplications,
        totalJobs: jobs2.length,
        earnings: {
          total: invoicesResult.rows[0]?.total || 0,
          awaiting: invoicesResult.rows[0]?.awaiting || 0,
          thisMonth: 0,
          thisWeek: 0
        },
        location: {
          lat: user?.primary_location_lat || user?.last_known_lat,
          lng: user?.primary_location_lng || user?.last_known_lng,
          address: user?.primary_location_address || user?.address
        },
        status: user?.is_connected ? "online" : "offline"
      };
      return res.json(addDualKeys(dashboard));
    } catch (e) {
      console.error("Dashboard error:", e.message);
      return res.json({ openJobs: 0, activeJobs: 0, completedJobs: 0, pendingApplications: 0, totalJobs: 0, earnings: { total: 0, awaiting: 0, thisMonth: 0, thisWeek: 0 } });
    }
  });
  app2.get("/api/earnings", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total,
                COALESCE(SUM(CASE WHEN status::text = 'payment_received' THEN total_amount ELSE 0 END), 0)::float as paid,
                COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued') THEN total_amount ELSE 0 END), 0)::float as pending
         FROM monthly_invoices WHERE driver_id = $1`,
        [auth.userId]
      );
      return res.json(addDualKeys(result.rows[0] || { total: 0, paid: 0, pending: 0 }));
    } catch {
      return res.json({ total: 0, paid: 0, pending: 0 });
    }
  });
  app2.get("/api/contractor/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const contractorId = auth.userId;
      const projectFilter = req.query.project_id;
      const status = req.query.status;
      const search = req.query.search;
      let query = `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.contractor_id = $1`;
      const params = [contractorId];
      let paramIdx = 2;
      if (projectFilter) {
        query += ` AND j.project_id = $${paramIdx}`;
        params.push(projectFilter);
        paramIdx++;
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === "in_progress" || statusLower === "active") {
          query += ` AND LOWER(j.status::text) IN ('in_progress', 'accepted', 'assigned')`;
        } else {
          query += ` AND LOWER(j.status::text) = LOWER($${paramIdx})`;
          params.push(status);
          paramIdx++;
        }
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      query += ` ORDER BY j.created_at DESC`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/contractor/jobs error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/driver/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id
         WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
         ORDER BY j.created_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  function getJobDateRange(scheduledDate, estimatedDays, includesWeekends) {
    const startDate = new Date(scheduledDate);
    if (isNaN(startDate.getTime())) return [];
    const days = Math.max(1, Math.ceil(estimatedDays || 1));
    const dates = [];
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    let added = 0;
    while (added < days) {
      const dow = current.getUTCDay();
      if (includesWeekends || dow !== 0 && dow !== 6) {
        const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
        dates.push(key);
        added++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }
  async function getJobsForCalendar(auth, role) {
    try {
      let result;
      if (role === "contractor") {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.contractor_id = $1 ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id
           WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      }
      return result.rows.map(addDualKeys);
    } catch {
    }
    return [];
  }
  app2.get("/api/calendar/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const allJobs = await getJobsForCalendar(auth, "driver");
      const driverId = auth.userId;
      const month = parseInt(req.query.month) || (/* @__PURE__ */ new Date()).getMonth() + 1;
      const year = parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear();
      const activeStatuses = /* @__PURE__ */ new Set(["open", "in_progress", "pending", "assigned"]);
      const myJobs = allJobs.filter((j) => {
        const dId = j.driverId || j.driver_id;
        const assignments = j.assignments || [];
        const isMyJob = dId === driverId || assignments.some((a) => a.driverId === driverId || a.driver_id === driverId);
        if (!isMyJob) return false;
        const status = (j.status || "").toLowerCase();
        return activeStatuses.has(status);
      });
      const dailyJobs = {};
      const jobDateSet = /* @__PURE__ */ new Set();
      const addToDay = (dateKey, entry) => {
        const [y, m] = dateKey.split("-").map(Number);
        if (y !== year || m !== month) return;
        if (!dailyJobs[dateKey]) dailyJobs[dateKey] = [];
        dailyJobs[dateKey].push(entry);
        jobDateSet.add(dateKey);
      };
      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends);
        jobDates.forEach((dateKey, idx) => {
          if (idx === 0) {
            addToDay(dateKey, job);
          } else {
            addToDay(dateKey, { ...job, isMultiDay: true, dayNumber: idx + 1, totalDays: jobDates.length });
          }
        });
      }
      return res.json({ dailyJobs, jobDates: Array.from(jobDateSet).sort() });
    } catch {
      return res.json({ dailyJobs: {}, jobDates: [] });
    }
  });
  app2.get("/api/contractor/calendar-capacity", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const allJobs = await getJobsForCalendar(auth, "contractor");
      const contractorId = auth.userId;
      const month = parseInt(req.query.month) || (/* @__PURE__ */ new Date()).getMonth() + 1;
      const year = parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear();
      const activeStatuses = /* @__PURE__ */ new Set(["open", "in_progress", "pending", "assigned"]);
      const myJobs = allJobs.filter((j) => {
        const cId = j.contractorId || j.contractor_id;
        if (cId !== contractorId) return false;
        const status = (j.status || "").toLowerCase();
        return activeStatuses.has(status);
      });
      const dailyJobs = {};
      const dailyCapacity = {};
      const addToDay = (dateKey, jobEntry) => {
        const [y, m] = dateKey.split("-").map(Number);
        if (y !== year || m !== month) return;
        if (!dailyJobs[dateKey]) dailyJobs[dateKey] = [];
        dailyJobs[dateKey].push(jobEntry);
        const trucksNeeded = jobEntry.trucksNeeded || jobEntry.trucks_needed || 0;
        const booked = jobEntry.assignedTruckCount || jobEntry.assigned_truck_count || jobEntry.approvedCount || jobEntry.approved_count || 0;
        if (!dailyCapacity[dateKey]) dailyCapacity[dateKey] = { booked: 0, needed: 0, jobCount: 0 };
        dailyCapacity[dateKey].booked += booked;
        dailyCapacity[dateKey].needed += trucksNeeded;
        dailyCapacity[dateKey].jobCount += 1;
      };
      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends);
        jobDates.forEach((dateKey, idx) => {
          if (idx === 0) {
            addToDay(dateKey, job);
          } else {
            addToDay(dateKey, { ...job, isMultiDay: true, dayNumber: idx + 1, totalDays: jobDates.length });
          }
        });
      }
      const fleetSize = Object.values(dailyCapacity).reduce((max, cap) => Math.max(max, cap.needed), 0);
      return res.json({ fleetSize, dailyCapacity, dailyJobs });
    } catch {
      return res.json({ fleetSize: 0, dailyCapacity: {}, dailyJobs: {} });
    }
  });
  app2.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const status = req.query.status;
      let query = `SELECT * FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`;
      const params = [auth.userId];
      if (status) {
        query += ` AND LOWER(status) = LOWER($2)`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      if (result.rows.length > 0) {
        const invoice = result.rows[0];
        const jobsResult = await pool.query(
          `SELECT * FROM jobs WHERE invoice_id = $1 OR (contractor_id = $2 AND status = 'completed')`,
          [req.params.id, invoice.contractor_id]
        );
        invoice.jobs = jobsResult.rows.map(addDualKeys);
        return res.json(addDualKeys(invoice));
      }
      return res.status(404).json({ message: "Invoice not found" });
    } catch {
      return res.status(500).json({ message: "Failed to load invoice" });
    }
  });
  app2.put("/api/invoices/:id/status", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { status } = req.body;
      await pool.query(`UPDATE monthly_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
      pushToWebsite(`/api/invoices/${req.params.id}/status`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch {
      return res.status(500).json({ message: "Failed to update invoice status" });
    }
  });
  app2.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const includeDeleted = req.query.include_deleted === "true";
      let query = `SELECT * FROM contractor_projects WHERE contractor_id = $1`;
      const params = [auth.userId];
      if (!includeDeleted) {
        query += ` AND (status != 'deleted' OR status IS NULL) AND deleted_at IS NULL`;
      }
      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      let projects = result.rows;
      if (projects.length === 0) {
        const jobResult = await pool.query(
          `SELECT DISTINCT project_id, material as name, contractor_id FROM jobs WHERE contractor_id = $1 AND project_id IS NOT NULL`,
          [auth.userId]
        );
        if (jobResult.rows.length > 0) {
          projects = jobResult.rows.map((r) => ({
            id: r.project_id,
            name: r.name || "Untitled Project",
            contractor_id: r.contractor_id,
            status: "active"
          }));
        }
      }
      return res.json(projects.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/projects error:", e.message);
      return res.json([]);
    }
  });
  app2.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const name = req.body.name || req.body.projectName || req.body.project_name || "Untitled Project";
      const jobNumber = req.body.jobNumber || req.body.job_number || null;
      const siteAddress = req.body.siteAddress || req.body.site_address || null;
      const siteLat = req.body.siteLat || req.body.site_lat || null;
      const siteLng = req.body.siteLng || req.body.site_lng || null;
      const notes = req.body.notes || null;
      await pool.query(
        `INSERT INTO contractor_projects (id, contractor_id, name, job_number, site_address, site_lat, site_lng, notes, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())`,
        [id, auth.userId, name, jobNumber, siteAddress, siteLat, siteLng, notes]
      );
      const result = await pool.query(`SELECT * FROM contractor_projects WHERE id = $1`, [id]);
      const project = result.rows[0];
      pushToWebsite("/api/projects", auth, { method: "POST", body: { ...req.body, id } }).catch(() => {
      });
      return res.status(201).json(addDualKeys(project));
    } catch (e) {
      console.error("POST /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });
  app2.put("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const updates = [];
      const values = [];
      let paramIdx = 1;
      const fieldMap = {
        name: "name",
        projectName: "name",
        project_name: "name",
        jobNumber: "job_number",
        job_number: "job_number",
        siteAddress: "site_address",
        site_address: "site_address",
        siteLat: "site_lat",
        site_lat: "site_lat",
        siteLng: "site_lng",
        site_lng: "site_lng",
        notes: "notes",
        status: "status"
      };
      for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
        if (req.body[bodyKey] !== void 0) {
          updates.push(`${dbCol} = $${paramIdx}`);
          values.push(req.body[bodyKey]);
          paramIdx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(
          `UPDATE contractor_projects SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
          values
        );
      }
      const result = await pool.query(`SELECT * FROM contractor_projects WHERE id = $1`, [req.params.id]);
      const project = result.rows[0] || { id: req.params.id, status: "active" };
      pushToWebsite(`/api/projects/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      return res.json(addDualKeys(project));
    } catch (e) {
      console.error("PUT /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });
  app2.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE contractor_projects SET status = 'deleted', deleted_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      const auth = getWebsiteAuth(req);
      pushToWebsite(`/api/projects/${req.params.id}`, auth, { method: "DELETE" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/projects/:id/restore", requireAuth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE contractor_projects SET status = 'active', deleted_at = NULL WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.get("/api/materials", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM contractor_materials WHERE contractor_id = $1 ORDER BY usage_count DESC, last_used_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/saved-locations", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const user = await pool.query(`SELECT * FROM users WHERE id = $1`, [auth.userId]);
      const u = user.rows[0];
      if (!u) return res.json([]);
      const locations = [];
      if (u.primary_location_address) locations.push({ address: u.primary_location_address, lat: u.primary_location_lat, lng: u.primary_location_lng, label: "Primary" });
      if (u.secondary_location_address) locations.push({ address: u.secondary_location_address, lat: u.secondary_location_lat, lng: u.secondary_location_lng, label: "Secondary" });
      if (u.tertiary_location_address) locations.push({ address: u.tertiary_location_address, lat: u.tertiary_location_lat, lng: u.tertiary_location_lng, label: "Tertiary" });
      return res.json(locations.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/reviews", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = __require("crypto").randomUUID();
      const b = req.body;
      await pool.query(
        `INSERT INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, comment, reviewer_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, b.jobId || b.job_id, auth.userId, b.revieweeId || b.reviewee_id, b.rating, b.comment, b.reviewerRole || b.reviewer_role || auth.user?.role]
      );
      pushToWebsite("/api/reviews", auth, { method: "POST", body: req.body }).catch(() => {
      });
      return res.status(201).json({ ok: true, id });
    } catch (e) {
      console.error("POST review error:", e.message);
      return res.status(500).json({ message: "Failed to submit review" });
    }
  });
  app2.get("/api/reviews/pending", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT j.id as job_id, j.material, j.origin_address, j.destination_address, j.contractor_id, j.driver_id
         FROM jobs j WHERE j.status = 'completed'
         AND (j.contractor_id = $1 OR j.driver_id = $1)
         AND j.id NOT IN (SELECT job_id FROM reviews WHERE reviewer_id = $1)
         ORDER BY j.completed_date DESC LIMIT 10`,
        [auth.userId]
      );
      return res.json({ reviews: result.rows.map(addDualKeys), count: result.rows.length });
    } catch {
      return res.json({ reviews: [], count: 0 });
    }
  });
  app2.get("/api/reviews/:userId", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, u.full_name as reviewer_name FROM reviews r LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`,
        [req.params.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/favorites/:driverId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`,
        [auth.userId, req.params.driverId]
      );
      return res.json({ isFavorite: result.rows.length > 0 });
    } catch {
      return res.json({ isFavorite: false });
    }
  });
  app2.post("/api/favorites/:driverId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const existing = await pool.query(
        `SELECT * FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`,
        [auth.userId, req.params.driverId]
      );
      if (existing.rows.length > 0) {
        await pool.query(`DELETE FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`, [auth.userId, req.params.driverId]);
        return res.json({ isFavorite: false });
      } else {
        const id = __require("crypto").randomUUID();
        await pool.query(`INSERT INTO driver_favorites (id, contractor_id, driver_id, created_at) VALUES ($1, $2, $3, NOW())`, [id, auth.userId, req.params.driverId]);
        pushToWebsite(`/api/favorites/${req.params.driverId}`, auth, { method: "POST" }).catch(() => {
        });
        return res.json({ isFavorite: true });
      }
    } catch {
      return res.json({ isFavorite: false });
    }
  });
  app2.get("/api/places/autocomplete", requireAuth, async (req, res) => {
    try {
      const input = req.query.input;
      if (!input || input.trim().length < 2) return res.json([]);
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });
      const lat = req.query.lat;
      const lng = req.query.lng;
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("types", "geocode|establishment");
      url.searchParams.set("components", "country:us|country:ca");
      if (lat && lng) {
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", "160000");
        url.searchParams.set("strictbounds", "true");
      }
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Places API status:", data.status, data.error_message);
      }
      const predictions = (data.predictions || []).map((p) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting
      }));
      return res.json(predictions);
    } catch (err) {
      console.error("Places autocomplete error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/places/details", requireAuth, async (req, res) => {
    try {
      const placeId = req.query.place_id;
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
          lng: data.result.geometry?.location?.lng
        });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (err) {
      console.error("Place details error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/places/geocode", requireAuth, async (req, res) => {
    try {
      const address = req.query.address;
      if (!address || address.trim().length < 3) return res.status(400).json({ message: "Address required" });
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });
      const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
      url.searchParams.set("input", address);
      url.searchParams.set("inputtype", "textquery");
      url.searchParams.set("fields", "formatted_address,geometry,place_id");
      url.searchParams.set("key", apiKey);
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === "OK" && data.candidates && data.candidates.length > 0) {
        const result = data.candidates[0];
        return res.json({
          address: result.formatted_address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng
        });
      }
      return res.status(404).json({ message: "Address not found" });
    } catch (err) {
      console.error("Geocode error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/directions", requireAuth, async (req, res) => {
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
          distance_text: leg.distance.text
        });
      }
      return res.status(404).json({ message: "No route found" });
    } catch (err) {
      console.error("Directions error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/map-embed", async (req, res) => {
    try {
      const { oLat, oLng, dLat, dLng, hasOrigin, hasDest } = req.query;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).send("Map API not configured");
      const originLat = parseFloat(oLat) || 0;
      const originLng = parseFloat(oLng) || 0;
      const destLat = parseFloat(dLat) || 0;
      const destLng = parseFloat(dLng) || 0;
      const showOrigin = hasOrigin === "true";
      const showDest = hasDest === "true";
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
  ${showOrigin ? `new google.maps.Marker({position:{lat:${originLat},lng:${originLng}},map,title:'Pickup',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#22c55e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ""}
  ${showDest ? `new google.maps.Marker({position:{lat:${destLat},lng:${destLng}},map,title:'Dropoff',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#FF9900',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ""}
  ${showOrigin && showDest ? `
  const ds=new google.maps.DirectionsService();
  const dr=new google.maps.DirectionsRenderer({suppressMarkers:true,polylineOptions:{strokeColor:'#3b82f6',strokeWeight:4}});
  dr.setMap(map);
  ds.route({origin:{lat:${originLat},lng:${originLng}},destination:{lat:${destLat},lng:${destLng}},travelMode:'DRIVING'},function(r,s){
    if(s==='OK'){dr.setDirections(r);const b=new google.maps.LatLngBounds();b.extend({lat:${originLat},lng:${originLng}});b.extend({lat:${destLat},lng:${destLng}});map.fitBounds(b,60);}
  });` : ""}
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap" async defer></script>
</body></html>`;
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    } catch (err) {
      console.error("Map embed error:", err);
      return res.status(500).send("Error loading map");
    }
  });
  app2.get("/api/directions/polyline", requireAuth, async (req, res) => {
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
        const encodedPolyline = route.overview_polyline?.points || "";
        const points = [];
        if (encodedPolyline) {
          let index = 0, lat = 0, lng = 0;
          while (index < encodedPolyline.length) {
            let b, shift = 0, result = 0;
            do {
              b = encodedPolyline.charCodeAt(index++) - 63;
              result |= (b & 31) << shift;
              shift += 5;
            } while (b >= 32);
            lat += result & 1 ? ~(result >> 1) : result >> 1;
            shift = 0;
            result = 0;
            do {
              b = encodedPolyline.charCodeAt(index++) - 63;
              result |= (b & 31) << shift;
              shift += 5;
            } while (b >= 32);
            lng += result & 1 ? ~(result >> 1) : result >> 1;
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
  startPeriodicSync(() => {
    const auths = [];
    for (const [, auth] of tokenToJwt) {
      auths.push(auth);
    }
    return auths;
  }, 6e4);
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false, limit: "20mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
