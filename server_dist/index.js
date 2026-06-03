var __defProp = Object.defineProperty;
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
import crypto from "node:crypto";

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
  also_driver: boolean("also_driver").default(false),
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
  includes_saturday: boolean("includes_saturday").default(true),
  includes_sunday: boolean("includes_sunday").default(true),
  estimated_cost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  cancelled_at: timestamp("cancelled_at"),
  requires_weight_tickets: boolean("requires_weight_tickets").default(false),
  total_amount_unit: text("total_amount_unit").default("tons"),
  original_rate: numeric("original_rate", { precision: 10, scale: 2 }),
  original_rate_type: text("original_rate_type"),
  requires_tarp: boolean("requires_tarp").default(false),
  archived_at: timestamp("archived_at")
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
  hidden_at: timestamp("hidden_at"),
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

// server/deleted-vehicles.ts
var deletedVehicleIds = /* @__PURE__ */ new Set();
var jobSyncPaused = false;

// server/sync.ts
var WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
var WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";
async function websiteFetchWithStatus(path2, options = {}) {
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
  const ct = res.headers.get("content-type") || "";
  let data = null;
  let errorText;
  let ok = res.ok;
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const txt = await res.text();
      errorText = txt.slice(0, 500);
      if (ok && /^\s*<!doctype\s+html|<html/i.test(txt)) {
        ok = false;
        errorText = `Endpoint returned HTML SPA shell (likely missing API route): ${path2}`;
      }
    } catch {
    }
  }
  return { ok, status: res.status, data, errorText };
}
async function websiteFetchSync(path2, options = {}) {
  const r = await websiteFetchWithStatus(path2, options);
  if (!r.ok) {
    console.warn(`[websiteFetchSync] ${options.method || "GET"} ${path2} failed: ${r.status} ${r.errorText?.slice(0, 200) || ""}`);
    return null;
  }
  return r.data;
}
var hiddenJobIds = /* @__PURE__ */ new Set([
  "964f3e5b-6fa2-4aa2-9f2f-57a98bf5835d",
  "415b98c6-6102-4170-93b1-65601200e267",
  "a863fc31-8346-4577-af17-c90201b3cecf",
  "78f95aef-24d3-4d14-acd3-e534dae5e124",
  "35d2ec43-7a9e-42fd-8692-bc2753aaa33a",
  "ca460caf-6b12-4328-bb92-1c75ab6056ff",
  "0316e819-f18c-4403-878d-06986573e979",
  "95f5512c-36df-4c84-afdc-c6fd81549839",
  "9abdfb36-32f2-4077-8250-da5d0a6bfd01",
  "024cdfbc-7e82-4420-b960-fe7e7b860283",
  "122b233f-5d75-4bbe-a46e-8afe1686771a",
  "8c128208-163f-4d7a-bbf9-0e9b9d06cc2b",
  "ae14fedb-dd4d-4cf5-a07a-0b6aa23f232e",
  "ba805c10-982e-4008-950a-7d9cc34f6830",
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
  "eec5123e-70d0-43f9-a0f0-1471d52e61e9",
  "5fd6891d-8bf8-4b81-bc89-b5c963767051",
  "0c9c925b-07f6-4caf-b00d-871671e266fb"
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
var ARCHIVE_PROTECTED_TABLES = /* @__PURE__ */ new Set(["jobs", "trucks"]);
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
  const archiveGuard = ARCHIVE_PROTECTED_TABLES.has(tableName) && columns.has("archived_at");
  const withdrawnGuard = tableName === "job_assignments" && columns.has("status");
  if (updateClauses.length === 0) {
    const sql2 = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO NOTHING`;
    await pool.query(sql2, values);
  } else {
    let whereClause = "";
    if (archiveGuard) {
      const incomingArchived = normalized["archived_at"];
      if (!incomingArchived) {
        whereClause = ` WHERE ${tableName}.archived_at IS NULL`;
      }
    }
    if (withdrawnGuard) {
      const prefix = whereClause ? " AND " : " WHERE ";
      whereClause += `${prefix}${tableName}.status::text != 'withdrawn'`;
    }
    const sql2 = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO UPDATE SET ${updateClauses.join(", ")}${whereClause}`;
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
async function syncJobs(auth, prefetchedJobs) {
  if (jobSyncPaused) return 0;
  try {
    let jobs2;
    if (prefetchedJobs) {
      jobs2 = prefetchedJobs;
    } else {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      if (!Array.isArray(allJobs)) return 0;
      jobs2 = allJobs.filter((j) => j.id && !hiddenJobIds.has(j.id));
    }
    const localJobsResult = await pool.query(
      `SELECT id, material, contractor_id, scheduled_date, created_at FROM jobs WHERE archived_at IS NULL`
    );
    const localJobs = localJobsResult.rows;
    const toDayStr = (v) => {
      if (!v) return "";
      if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().substring(0, 10);
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
      const d = new Date(s);
      return isNaN(d.getTime()) ? "" : d.toISOString().substring(0, 10);
    };
    const websiteIdToLocalId = {};
    const deduped = jobs2.filter((wj) => {
      const wId = wj.id;
      if (localJobs.some((lj) => lj.id === wId)) return true;
      const wMaterial = (wj.material || "").toLowerCase().trim();
      const wContractor = String(wj.contractor_id || wj.contractorId || "");
      const wScheduledStr = toDayStr(wj.scheduled_date || wj.scheduledDate);
      const wCreated = new Date(wj.created_at || wj.createdAt || 0).getTime();
      for (const lj of localJobs) {
        if (lj.id === wId) continue;
        const lMaterial = (lj.material || "").toLowerCase().trim();
        const lContractor = String(lj.contractor_id || "");
        const lScheduledStr = toDayStr(lj.scheduled_date);
        const lCreated = new Date(lj.created_at).getTime();
        const matchAll = lMaterial === wMaterial && lContractor === wContractor && lScheduledStr === wScheduledStr && Math.abs(wCreated - lCreated) < 3e5;
        if (matchAll) {
          console.log(`[syncJobs dedup] dropping website job ${wId} -> matches local ${lj.id}`);
          websiteIdToLocalId[wId] = lj.id;
          return false;
        }
        if (lMaterial === wMaterial && lContractor === wContractor && lScheduledStr === wScheduledStr) {
          console.log(`[syncJobs dedup-near-miss] wId=${wId} lId=${lj.id} mat=ok contractor=ok sched=ok createdDiffMs=${wCreated - lCreated}`);
        }
      }
      return true;
    });
    if (Object.keys(websiteIdToLocalId).length > 0) {
      console.log(`[syncJobs] dedup mappings:`, websiteIdToLocalId);
    }
    const count = await upsertMany("jobs", deduped);
    try {
      const websiteIds = new Set(jobs2.map((j) => String(j.id)));
      const dedupedToOriginalIds = new Set(Object.values(websiteIdToLocalId));
      const reconcileResult = await pool.query(
        `SELECT id FROM jobs
         WHERE (contractor_id = $1 OR driver_id = $1)
           AND archived_at IS NULL
           AND status NOT IN ('completed', 'cancelled')
           AND created_at < NOW() - INTERVAL '5 minutes'
           AND id NOT IN (
             SELECT (body->>'id')::text FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND body ? 'id'
             UNION
             SELECT regexp_replace(path, '^/api/jobs/([^/]+).*$', '\\1') FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND path ~ '^/api/jobs/[^/]+'
           )`,
        [auth.userId, auth.userId]
      );
      const removedIds = [];
      for (const row of reconcileResult.rows) {
        const lid = String(row.id);
        if (!websiteIds.has(lid) && !dedupedToOriginalIds.has(lid)) {
          removedIds.push(lid);
        }
      }
      if (removedIds.length > 0) {
        console.log(`[syncJobs reconcile] cancelling ${removedIds.length} local jobs missing from website:`, removedIds);
        await pool.query(
          `UPDATE jobs SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), archived_at = COALESCE(archived_at, NOW())
           WHERE id = ANY($1::varchar[])`,
          [removedIds]
        );
      }
    } catch (e) {
      console.error("syncJobs reconcile error:", e.message);
    }
    await updateSyncTime("jobs", auth.userId);
    return count;
  } catch (e) {
    console.error("syncJobs error:", e.message);
    return 0;
  }
}
async function syncProjects(auth, cachedJobs) {
  if (jobSyncPaused) return 0;
  try {
    const websiteProjects = await websiteFetchSync("/api/contractor-projects", {
      jwt: auth.jwt,
      query: { contractorId: auth.userId }
    });
    if (!Array.isArray(websiteProjects)) {
      await updateSyncTime("projects", auth.userId);
      return 0;
    }
    const count = websiteProjects.length > 0 ? await upsertMany("contractor_projects", websiteProjects) : 0;
    try {
      const websiteIds = new Set(websiteProjects.map((p) => String(p.id)));
      const reconcileResult = await pool.query(
        `SELECT id FROM contractor_projects
         WHERE contractor_id = $1
           AND deleted_at IS NULL
           AND created_at < NOW() - INTERVAL '5 minutes'
           AND id NOT IN (
             SELECT (body->>'id')::text FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND body ? 'id'
             UNION
             SELECT regexp_replace(path, '^/api/(contractor-projects|projects)/([^/]+).*$', '\\2') FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND path ~ '^/api/(contractor-projects|projects)/[^/]+'
           )`,
        [auth.userId, auth.userId]
      );
      const removedIds = [];
      for (const row of reconcileResult.rows) {
        const lid = String(row.id);
        if (!websiteIds.has(lid)) removedIds.push(lid);
      }
      if (removedIds.length > 0) {
        console.log(`[syncProjects reconcile] soft-deleting ${removedIds.length} local projects missing from website:`, removedIds);
        await pool.query(
          `UPDATE contractor_projects SET deleted_at = NOW() WHERE id = ANY($1::varchar[])`,
          [removedIds]
        );
      }
    } catch (e) {
      console.error("syncProjects reconcile error:", e.message);
    }
    await updateSyncTime("projects", auth.userId);
    return count;
  } catch (e) {
    console.error("syncProjects error:", e.message);
    return 0;
  }
}
async function syncJobAssignments(auth) {
  if (jobSyncPaused) return 0;
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
    const mapped = data.filter((v) => !deletedVehicleIds.has(String(v.id))).map((v) => ({
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
var _syncInProgress = /* @__PURE__ */ new Map();
async function fullSync(auth) {
  if (_syncInProgress.get(auth.userId)) {
    return { jobs: 0, projects: 0, assignments: 0, vehicles: 0 };
  }
  _syncInProgress.set(auth.userId, true);
  const t0 = Date.now();
  console.log(`[Sync] Starting full sync for user ${auth.userId}...`);
  try {
    await syncUser(auth);
    let jobCount = 0;
    let jobsList = [];
    if (!jobSyncPaused) {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      jobsList = Array.isArray(allJobs) ? allJobs.filter((j) => j.id && !hiddenJobIds.has(j.id)) : [];
      jobCount = await syncJobs(auth, jobsList);
    }
    const [projects, assignments, vehicles] = await Promise.allSettled([
      syncProjects(auth, jobsList),
      syncJobAssignments(auth),
      syncVehicles(auth)
    ]);
    Promise.allSettled([
      syncAvailability(auth),
      syncInvoices(auth),
      syncNotifications(auth),
      drainSyncQueue(auth)
    ]).catch(() => {
    });
    const result = {
      jobs: jobCount,
      projects: projects.status === "fulfilled" ? projects.value : 0,
      assignments: assignments.status === "fulfilled" ? assignments.value : 0,
      vehicles: vehicles.status === "fulfilled" ? vehicles.value : 0
    };
    console.log(`[Sync] Full sync complete in ${Date.now() - t0}ms: ${JSON.stringify(result)}`);
    return result;
  } finally {
    _syncInProgress.set(auth.userId, false);
  }
}
var _syncQueueReady = false;
async function ensureSyncQueueTable() {
  if (_syncQueueReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      method VARCHAR NOT NULL,
      body JSONB,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_status INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_attempted_at TIMESTAMP,
      succeeded_at TIMESTAMP,
      dedupe_key VARCHAR UNIQUE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sync_queue_user_pending_idx
      ON sync_queue(user_id, id) WHERE succeeded_at IS NULL;
  `);
  const fksToDrop = [
    ["jobs", "jobs_project_id_fkey"],
    ["jobs", "jobs_contractor_id_users_id_fk"],
    ["jobs", "jobs_driver_id_users_id_fk"],
    ["trucks", "trucks_trucking_company_id_fkey"],
    ["trucks", "trucks_assigned_driver_id_fkey"],
    ["contractor_projects", "contractor_projects_contractor_id_fkey"]
  ];
  for (const [table, fk] of fksToDrop) {
    try {
      await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${fk}`);
    } catch (e) {
      console.warn(`[Sync] Failed to drop FK ${fk}:`, e.message);
    }
  }
  _syncQueueReady = true;
}
var MAX_SYNC_ATTEMPTS = 15;
function buildDedupeKey(userId, method, path2, body) {
  const bodyId = body && typeof body === "object" ? body.id || body.ID : void 0;
  const idPart = bodyId || "_";
  return `${userId}|${method}|${path2}|${idPart}`;
}
async function attemptQueuedPush(rowId, auth) {
  const r = await pool.query(`SELECT * FROM sync_queue WHERE id = $1`, [rowId]);
  const row = r.rows[0];
  if (!row || row.succeeded_at) return null;
  try {
    const result = await websiteFetchWithStatus(row.path, {
      method: row.method,
      body: row.body,
      jwt: auth.jwt
    });
    if (result.ok) {
      await pool.query(
        `UPDATE sync_queue SET succeeded_at = NOW(), last_attempted_at = NOW(), attempts = attempts + 1, last_status = $1, last_error = NULL WHERE id = $2`,
        [result.status, rowId]
      );
      return result.data;
    } else {
      const errSnippet = result.errorText || result.data && JSON.stringify(result.data) || "";
      const errMsg = `HTTP ${result.status}${errSnippet ? `: ${String(errSnippet).slice(0, 300)}` : ""}`;
      const TERMINAL_STATUSES = /* @__PURE__ */ new Set([400, 403, 404, 410, 415, 422]);
      const terminal = TERMINAL_STATUSES.has(result.status);
      const newAttempts = terminal ? MAX_SYNC_ATTEMPTS : null;
      if (terminal) {
        await pool.query(
          `UPDATE sync_queue SET attempts = $1, last_attempted_at = NOW(), last_status = $2, last_error = $3 WHERE id = $4`,
          [newAttempts, result.status, errMsg, rowId]
        );
      } else {
        await pool.query(
          `UPDATE sync_queue SET attempts = attempts + 1, last_attempted_at = NOW(), last_status = $1, last_error = $2 WHERE id = $3`,
          [result.status, errMsg, rowId]
        );
      }
      console.error(`[Sync] Push ${row.method} ${row.path} failed: ${errMsg}${terminal ? " (terminal)" : ""}`);
      return null;
    }
  } catch (e) {
    const errMsg = e?.message?.slice(0, 500) || "unknown error";
    await pool.query(
      `UPDATE sync_queue SET attempts = attempts + 1, last_attempted_at = NOW(), last_error = $1 WHERE id = $2`,
      [errMsg, rowId]
    );
    console.error(`[Sync] Push ${row.method} ${row.path} threw: ${errMsg}`);
    return null;
  }
}
async function pushToWebsite(path2, auth, options = {}) {
  try {
    await ensureSyncQueueTable();
    const method = options.method || "POST";
    const body = options.body ?? null;
    const dedupeKey = buildDedupeKey(auth.userId, method, path2, body);
    const ins = await pool.query(
      `INSERT INTO sync_queue (user_id, path, method, body, dedupe_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dedupe_key) DO UPDATE
         SET body = EXCLUDED.body,
             succeeded_at = NULL,
             attempts = 0,
             last_error = NULL,
             last_status = NULL
       RETURNING id`,
      [auth.userId, path2, method, body ? JSON.stringify(body) : null, dedupeKey]
    );
    const rowId = ins.rows[0].id;
    return await attemptQueuedPush(rowId, auth);
  } catch (e) {
    console.error(`[Sync] pushToWebsite enqueue failed for ${path2}:`, e.message);
    return null;
  }
}
async function drainSyncQueue(auth, limit = 50) {
  await ensureSyncQueueTable();
  const result = await pool.query(
    `SELECT id FROM sync_queue
     WHERE user_id = $1 AND succeeded_at IS NULL AND attempts < $2
     ORDER BY id ASC LIMIT $3`,
    [auth.userId, MAX_SYNC_ATTEMPTS, limit]
  );
  let succeeded = 0, failed = 0;
  for (const row of result.rows) {
    const r = await attemptQueuedPush(row.id, auth);
    if (r !== null) succeeded++;
    else failed++;
  }
  if (result.rows.length > 0) {
    console.log(`[Sync] drainSyncQueue user=${auth.userId} attempted=${result.rows.length} succeeded=${succeeded} failed=${failed}`);
  }
  return { attempted: result.rows.length, succeeded, failed };
}
async function getSyncQueueStatus(userId) {
  try {
    await ensureSyncQueueTable();
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE succeeded_at IS NULL AND attempts < $2)::int AS pending,
         COUNT(*) FILTER (WHERE succeeded_at IS NULL AND attempts >= $2)::int AS failed
       FROM sync_queue WHERE user_id = $1`,
      [userId, MAX_SYNC_ATTEMPTS]
    );
    return { pending: r.rows[0].pending || 0, failed: r.rows[0].failed || 0 };
  } catch {
    return { pending: 0, failed: 0 };
  }
}
var _syncTimers = /* @__PURE__ */ new Map();
var _lastUserActivity = /* @__PURE__ */ new Map();
function recordUserActivity(userId) {
  _lastUserActivity.set(userId, Date.now());
}
function startPeriodicSync(getActiveAuths, intervalMs = 12e4) {
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
var WEBSITE_API_URL2 = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
var WEBSITE_API_KEY2 = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";
var DATA_DIR = join(process.cwd(), ".data");
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
}
async function sendPushNotification(userId, title, body, data) {
  try {
    const result = await pool.query(`SELECT expo_push_token FROM users WHERE id::text = $1 LIMIT 1`, [userId]);
    const token = result.rows[0]?.expo_push_token;
    if (!token) return;
    const message = { to: token, sound: "default", title, body, data: data || {} };
    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (!pushRes.ok) console.error("Push notification failed:", pushRes.status);
  } catch (e) {
    console.error("Push notification error:", e.message);
  }
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
  "964f3e5b-6fa2-4aa2-9f2f-57a98bf5835d",
  "415b98c6-6102-4170-93b1-65601200e267",
  "a863fc31-8346-4577-af17-c90201b3cecf",
  "78f95aef-24d3-4d14-acd3-e534dae5e124",
  "35d2ec43-7a9e-42fd-8692-bc2753aaa33a",
  "ca460caf-6b12-4328-bb92-1c75ab6056ff",
  "0316e819-f18c-4403-878d-06986573e979",
  "95f5512c-36df-4c84-afdc-c6fd81549839",
  "9abdfb36-32f2-4077-8250-da5d0a6bfd01",
  "024cdfbc-7e82-4420-b960-fe7e7b860283",
  "122b233f-5d75-4bbe-a46e-8afe1686771a",
  "8c128208-163f-4d7a-bbf9-0e9b9d06cc2b",
  "ae14fedb-dd4d-4cf5-a07a-0b6aa23f232e",
  "ba805c10-982e-4008-950a-7d9cc34f6830",
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
  if (obj === null || typeof obj !== "object" || obj instanceof Date) return obj;
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
            message: "No LoadLink account found with this email. Please sign up first on loadlinklive.com",
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
      const localToken = crypto.randomBytes(32).toString("hex");
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
          const localToken2 = crypto.randomBytes(32).toString("hex");
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
      const localToken = crypto.randomBytes(32).toString("hex");
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
        const localToken = crypto.randomBytes(32).toString("hex");
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
      let query = `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.archived_at IS NULL`;
      const params = [];
      let paramIdx = 1;
      if (hiddenJobIds2.size > 0) {
        query += ` AND j.id NOT IN (${[...hiddenJobIds2].map((_, i) => `$${paramIdx + i}`).join(",")})`;
        params.push(...hiddenJobIds2);
        paramIdx += hiddenJobIds2.size;
      }
      const singleDate = req.query.date;
      if (singleDate) {
        query += ` AND (
          j.scheduled_date::date = $${paramIdx}::date
          OR (
            j.scheduled_date::date < $${paramIdx}::date
            AND COALESCE(j.estimated_days, 1)::numeric > 1
            AND (j.scheduled_date::date + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day')::date >= $${paramIdx}::date
          )
        )`;
        params.push(singleDate);
        paramIdx++;
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
          query += ` AND j.status::text IN ('in_progress', 'accepted', 'pending')`;
        } else if (statusLower === "open") {
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')`;
        } else {
          query += ` AND j.status::text = $${paramIdx}`;
          params.push(statusLower);
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
      query += ` AND NOT (
        j.contractor_id::text != $${paramIdx}
        AND j.status::text IN ('open', 'accepted', 'pending')
        AND (
          (SELECT COUNT(*) FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.status::text = 'approved')
          >= COALESCE(j.trucks_needed, 1)
          OR EXISTS (
            SELECT 1 FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.driver_id = $${paramIdx}
              AND ja.status::text = 'approved'
          )
          OR (
            (SELECT COUNT(*) FROM job_assignments ja
              WHERE ja.job_id = j.id AND ja.status::text IN ('pending', 'approved'))
            >= CASE
                WHEN COALESCE(j.trucks_needed, 1) <= 1 THEN 5
                WHEN COALESCE(j.trucks_needed, 1) = 2 THEN 8
                ELSE 3 * COALESCE(j.trucks_needed, 1)
              END
            AND NOT EXISTS (
              SELECT 1 FROM job_assignments ja
              WHERE ja.job_id = j.id AND ja.driver_id = $${paramIdx}
                AND ja.status::text IN ('pending', 'approved')
            )
          )
        )
      )`;
      params.push(auth.userId);
      paramIdx++;
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/jobs local error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/jobs/archived", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id
         WHERE j.archived_at IS NOT NULL AND (j.contractor_id = $1 OR j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
         ORDER BY j.archived_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/jobs/:id/unarchive", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const upd = await pool.query(
        `UPDATE jobs SET archived_at = NULL, status = 'open', cancelled_at = NULL
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Unarchive job error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive job" });
    }
  });
  app2.post("/api/jobs/:id/cancel", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const reason = (req.body?.reason || "").toString();
      const upd = await pool.query(
        `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      pushToWebsite(`/api/jobs/${req.params.id}/cancel`, auth, { method: "POST", body: reason ? { reason } : {} }).catch(() => {
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Cancel job error:", e.message);
      return res.status(500).json({ message: "Failed to cancel job" });
    }
  });
  app2.post("/api/jobs/:id/archive", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const upd = await pool.query(
        `UPDATE jobs SET archived_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Archive job error:", e.message);
      return res.status(500).json({ message: "Failed to archive job" });
    }
  });
  app2.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
        const assignResult = await pool.query(
          `SELECT ja.*, t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                  t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                  t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp
           FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id WHERE ja.job_id = $1`,
          [req.params.id]
        );
        const runsResult = await pool.query(`SELECT * FROM job_runs WHERE job_id = $1 ORDER BY created_at DESC`, [req.params.id]);
        const weightResult = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1`, [req.params.id]);
        job.assignments = assignResult.rows.map((row) => {
          const a = addDualKeys(row);
          if (row.vehicle_id) {
            a.vehicle = {
              id: row.vehicle_id,
              make: row.vehicle_make,
              model: row.vehicle_model,
              year: row.vehicle_year,
              truck_number: row.vehicle_truck_number,
              truckNumber: row.vehicle_truck_number,
              license_plate: row.vehicle_license_plate,
              licensePlate: row.vehicle_license_plate,
              truck_type: row.vehicle_truck_type,
              truckType: row.vehicle_truck_type,
              capacity: row.vehicle_capacity,
              max_capacity_tons: row.vehicle_capacity,
              has_tarp: row.vehicle_has_tarp,
              hasTarp: row.vehicle_has_tarp
            };
          }
          return a;
        });
        job.jobRuns = runsResult.rows.map(addDualKeys);
        job.job_runs = job.jobRuns;
        job.runs = job.jobRuns;
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
      const id = crypto.randomUUID();
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
        "includes_saturday",
        "includes_sunday",
        "estimated_cost",
        "origin_lat",
        "origin_lng",
        "destination_lat",
        "destination_lng",
        "job_type",
        "requires_weight_tickets",
        "requires_tarp",
        "urgent",
        "paperwork_description",
        "created_at",
        "updated_at",
        "capacity_needed",
        "total_tons_needed",
        "total_amount_unit",
        "pickup_time",
        "estimated_trips"
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
      const pushBody = { ...req.body, id };
      console.log(`POST /api/jobs pushing to website with projectId=${pushBody.projectId || pushBody.project_id || "none"}, id=${id}`);
      pushToWebsite("/api/jobs", auth, { method: "POST", body: pushBody }).catch(() => {
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
      const beforeRow = await pool.query(`SELECT scheduled_date, material, contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      const prevDate = beforeRow.rows[0]?.scheduled_date ? String(beforeRow.rows[0].scheduled_date).slice(0, 10) : null;
      const jobMaterial = beforeRow.rows[0]?.material || "";
      const jobContractorId = beforeRow.rows[0]?.contractor_id;
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
      const newDateRaw = req.body?.scheduledDate ?? req.body?.scheduled_date;
      const newDate = newDateRaw ? String(newDateRaw).slice(0, 10) : null;
      const dateChanged = newDate && prevDate && newDate !== prevDate;
      if (dateChanged) {
        const approvedAssignments = await pool.query(
          `SELECT id, driver_id FROM job_assignments WHERE job_id = $1 AND status::text = 'approved'`,
          [req.params.id]
        );
        if (approvedAssignments.rows.length > 0) {
          await pool.query(
            `UPDATE job_assignments SET status = 'pending', approved_at = NULL WHERE job_id = $1 AND status::text = 'approved'`,
            [req.params.id]
          );
          await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1 AND status::text = 'accepted'`, [req.params.id]);
          const contractorRow = jobContractorId ? await pool.query(`SELECT full_name, company FROM users WHERE id::text = $1`, [String(jobContractorId)]) : { rows: [] };
          const contractorName = contractorRow.rows[0]?.company || contractorRow.rows[0]?.full_name || "The contractor";
          const formatted = (() => {
            try {
              const [y, m, d] = newDate.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            } catch {
              return newDate;
            }
          })();
          const notifTitle = "Job Date Changed - Confirm Availability";
          const notifBody = `${contractorName} moved the ${jobMaterial || "job"} to ${formatted}. Re-confirm to keep your assignment.`;
          for (const a of approvedAssignments.rows) {
            if (a.driver_id) {
              sendPushNotification(String(a.driver_id), notifTitle, notifBody, { jobId: req.params.id, type: "job_date_changed" });
            }
          }
        }
      }
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      if (dateChanged) {
        pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {
        });
      }
      return res.json(addDualKeys(result.rows[0] || { id: req.params.id }));
    } catch (e) {
      console.error("PUT /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to update job" });
    }
  });
  app2.delete("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const upd = await pool.query(
        `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW(), archived_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/jobs/:id/accept", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { vehicleIds } = req.body || {};
      const jobRow = await pool.query(
        `SELECT contractor_id, COALESCE(trucks_needed, 1)::int AS trucks_needed FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const contractorId = jobRow.rows[0]?.contractor_id;
      const trucksNeeded = Number(jobRow.rows[0]?.trucks_needed) || 1;
      let isAutoApprove = false;
      if (contractorId) {
        const userRow = await pool.query(`SELECT company FROM users WHERE id::text = $1`, [auth.userId]);
        const driverCompany = userRow.rows[0]?.company || "";
        const favCheck = await pool.query(
          `SELECT id FROM contractor_favorites WHERE contractor_id = $1 AND (
            (favorite_type = 'driver' AND favorite_driver_id = $2)
            OR (favorite_type = 'company' AND favorite_company_name = $3 AND $3 != '')
          ) LIMIT 1`,
          [contractorId, auth.userId, driverCompany]
        );
        isAutoApprove = favCheck.rows.length > 0;
      }
      const requestedCount = vehicleIds && Array.isArray(vehicleIds) && vehicleIds.length > 0 ? vehicleIds.length : 1;
      if (isAutoApprove) {
        const approvedRow = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND status::text = 'approved'`,
          [req.params.id]
        );
        const myPendingRow = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        const approvedCount = approvedRow.rows[0]?.c || 0;
        const myPendingCount = myPendingRow.rows[0]?.c || 0;
        const slotsLeft = Math.max(0, trucksNeeded - approvedCount - myPendingCount);
        if (slotsLeft === 0) {
          return res.status(400).json({
            message: `This job is already fully staffed (${approvedCount + myPendingCount}/${trucksNeeded} trucks).`
          });
        }
        if (requestedCount > slotsLeft) {
          return res.status(400).json({
            message: `This job only has ${slotsLeft} truck slot${slotsLeft === 1 ? "" : "s"} left for auto-approval. You're trying to book ${requestedCount}.`
          });
        }
      }
      await pool.query(`UPDATE jobs SET status = 'pending', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      if (vehicleIds && Array.isArray(vehicleIds) && vehicleIds.length > 0) {
        for (const vehicleId of vehicleIds) {
          const id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO job_assignments (id, job_id, driver_id, vehicle_id, status, created_at)
             VALUES ($1, $2, $3, $4, 'pending', NOW())
             ON CONFLICT DO NOTHING`,
            [id, req.params.id, auth.userId, vehicleId]
          );
        }
      } else {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO job_assignments (id, job_id, driver_id, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())
           ON CONFLICT DO NOTHING`,
          [id, req.params.id, auth.userId]
        );
      }
      let autoApproved = false;
      if (isAutoApprove) {
        await pool.query(
          `UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
        autoApproved = true;
      }
      pushToWebsite(`/api/jobs/${req.params.id}/accept`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const jobForNotif = result.rows[0];
      if (contractorId && contractorId !== auth.userId) {
        const applicantRow = await pool.query(`SELECT full_name, company FROM users WHERE id::text = $1`, [auth.userId]);
        const applicantName = applicantRow.rows[0]?.company || applicantRow.rows[0]?.full_name || "A driver";
        const truckCount = vehicleIds && Array.isArray(vehicleIds) ? vehicleIds.length : 1;
        const notifTitle = "New Truck Application";
        const notifBody = `${applicantName} applied ${truckCount} truck${truckCount > 1 ? "s" : ""} to your ${jobForNotif?.material || ""} job`;
        sendPushNotification(contractorId, notifTitle, notifBody, { jobId: req.params.id, type: "job_application" });
      }
      return res.json({ ...addDualKeys(jobForNotif || { id: req.params.id, status: "pending" }), autoApproved });
    } catch (e) {
      console.error("Accept job error:", e.message);
      return res.status(500).json({ message: "Failed to accept job" });
    }
  });
  app2.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const jobResult = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const job = jobResult.rows[0];
      const assignResult = await pool.query(
        `SELECT ja.*, j.scheduled_date, j.estimated_days, j.material as job_material FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.vehicle_id IS NOT NULL AND ja.job_id != $1
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')
         AND ja.status::text NOT IN ('withdrawn', 'rejected', 'cancelled', 'expired')`,
        [req.params.id]
      );
      const vehiclesResult = await pool.query(
        `SELECT * FROM trucks WHERE trucking_company_id = $1 AND archived_at IS NULL`,
        [auth.userId]
      );
      const availResult = await pool.query(
        `SELECT * FROM driver_availability WHERE driver_id = $1 AND is_available = false AND vehicle_id IS NOT NULL`,
        [auth.userId]
      );
      const requiredCapacity = (() => {
        if (!job?.capacity_needed) return 0;
        const match = String(job.capacity_needed).match(/([\d.]+)/);
        return match ? parseFloat(match[1]) : 0;
      })();
      const requiresTarp = job?.requires_tarp || false;
      const requiredType = job?.truck_type || null;
      const jobStart = job?.scheduled_date ? new Date(job.scheduled_date) : null;
      const jobDays = Math.ceil(Number(job?.estimated_days) || 1);
      const jobDateKeys = [];
      if (jobStart) {
        for (let i = 0; i < jobDays; i++) {
          const d = new Date(jobStart);
          d.setDate(d.getDate() + i);
          jobDateKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
        }
      }
      const vehicleConflicts = {};
      for (const v of vehiclesResult.rows) {
        const vId = v.id;
        const vCapacity = parseFloat(v.capacity) || 0;
        const vHasTarp = v.has_tarp || false;
        const vType = v.truck_type || null;
        let blocked = false;
        let wrongType = false;
        let lowCapacity = false;
        let noTarp = false;
        let unavailable = false;
        const conflictDates = [];
        const conflictJobs = [];
        if (requiredType && vType && String(vType) !== String(requiredType)) {
          wrongType = true;
          blocked = true;
        }
        if (requiredCapacity > 0 && vCapacity > 0 && vCapacity < requiredCapacity) {
          lowCapacity = true;
          blocked = true;
        }
        if (requiresTarp && !vHasTarp) {
          noTarp = true;
          blocked = true;
        }
        for (const avail of availResult.rows) {
          if (avail.vehicle_id !== vId) continue;
          const aDate = new Date(avail.date);
          const aKey = `${aDate.getUTCFullYear()}-${String(aDate.getUTCMonth() + 1).padStart(2, "0")}-${String(aDate.getUTCDate()).padStart(2, "0")}`;
          if (jobDateKeys.includes(aKey)) {
            unavailable = true;
            blocked = true;
            break;
          }
        }
        for (const a of assignResult.rows) {
          if (a.vehicle_id !== vId) continue;
          const aStart = new Date(a.scheduled_date);
          const aDays = Math.ceil(Number(a.estimated_days) || 1);
          for (let i = 0; i < aDays; i++) {
            const d = new Date(aStart);
            d.setDate(d.getDate() + i);
            const dKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
            if (jobDateKeys.includes(dKey)) {
              conflictDates.push(dKey);
              if (a.job_material && !conflictJobs.includes(a.job_material)) conflictJobs.push(a.job_material);
              blocked = true;
            }
          }
        }
        vehicleConflicts[vId] = {
          blocked,
          wrongType,
          lowCapacity,
          noTarp,
          unavailable,
          conflictDates: [...new Set(conflictDates)],
          conflictJobs,
          requiredTons: requiredCapacity,
          vehicleTons: vCapacity
        };
      }
      return res.json({ vehicleConflicts, requiredTruckType: requiredType });
    } catch (e) {
      console.error("vehicle-conflicts error:", e.message);
      return res.json({ vehicleConflicts: {} });
    }
  });
  app2.post("/api/jobs/:id/counter-bid", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { rate, note } = req.body;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO job_assignments (id, job_id, driver_id, status, counter_bid_rate, counter_bid_note, created_at)
         VALUES ($1, $2, $3, 'counter_bid', $4, $5, NOW()) ON CONFLICT DO NOTHING`,
        [id, req.params.id, auth.userId, rate, note]
      );
      pushToWebsite(`/api/jobs/${req.params.id}/bids`, auth, { method: "POST", body: req.body }).catch(() => {
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
      const myAssignments = await pool.query(
        `SELECT id FROM job_assignments WHERE job_id = $1 AND driver_id = $2`,
        [req.params.id, auth.userId]
      );
      await pool.query(`UPDATE job_assignments SET status = 'withdrawn' WHERE job_id = $1 AND driver_id = $2`, [req.params.id, auth.userId]);
      const remaining = await pool.query(`SELECT COUNT(*) FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`, [req.params.id]);
      if (parseInt(remaining.rows[0]?.count || "0") === 0) {
        await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req, res) => {
    try {
      await pool.query(`UPDATE job_assignments SET status = 'withdrawn' WHERE id = $1`, [req.params.assignmentId]);
      const remaining = await pool.query(`SELECT COUNT(*) FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`, [req.params.id]);
      const remainingCount = parseInt(remaining.rows[0]?.count || "0");
      if (remainingCount === 0) {
        await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      }
      return res.json({ ok: true, remainingAssignments: remainingCount });
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
      const auth = getWebsiteAuth(req);
      try {
        await syncJobAssignments(auth);
      } catch {
      }
      const result = await pool.query(
        `SELECT ja.*, u.full_name as driver_name, u.phone as driver_phone, u.email as driver_email, u.truck_type as driver_truck_type, u.rating as driver_rating, u.company as driver_company,
                t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp
         FROM job_assignments ja 
         LEFT JOIN users u ON ja.driver_id = u.id 
         LEFT JOIN trucks t ON ja.vehicle_id = t.id
         WHERE ja.job_id = $1`,
        [req.params.id]
      );
      return res.json(result.rows.map((row) => {
        const a = addDualKeys(row);
        if (row.vehicle_id) {
          a.vehicle = {
            id: row.vehicle_id,
            make: row.vehicle_make,
            model: row.vehicle_model,
            year: row.vehicle_year,
            truck_number: row.vehicle_truck_number,
            truckNumber: row.vehicle_truck_number,
            license_plate: row.vehicle_license_plate,
            licensePlate: row.vehicle_license_plate,
            truck_type: row.vehicle_truck_type,
            truckType: row.vehicle_truck_type,
            capacity: row.vehicle_capacity,
            max_capacity_tons: row.vehicle_capacity,
            maxCapacityTons: row.vehicle_capacity,
            has_tarp: row.vehicle_has_tarp,
            hasTarp: row.vehicle_has_tarp
          };
        }
        return a;
      }));
    } catch {
      return res.json([]);
    }
  });
  app2.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const jobCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!jobCheck.rows[0] || jobCheck.rows[0].contractor_id !== auth.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await pool.query(`UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {
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
      const jobCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!jobCheck.rows[0] || jobCheck.rows[0].contractor_id !== auth.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await pool.query(`UPDATE job_assignments SET status = 'rejected' WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/reject`, auth, { method: "POST" }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT cf.*, 
          COALESCE(u.first_name || ' ' || u.last_name, '') as driver_name,
          u.company as driver_company
        FROM contractor_favorites cf
        LEFT JOIN users u ON cf.favorite_driver_id = u.id AND cf.favorite_type = 'driver'
        WHERE cf.contractor_id = $1 
        ORDER BY cf.created_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  });
  app2.post("/api/favorites", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { favoriteType, favoriteDriverId, favoriteCompanyName } = req.body;
      const id = crypto.randomUUID();
      if (favoriteType === "driver" && favoriteDriverId) {
        await pool.query(
          `INSERT INTO contractor_favorites (id, contractor_id, favorite_type, favorite_driver_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, auth.userId, "driver", favoriteDriverId]
        );
      } else if (favoriteType === "company" && favoriteCompanyName) {
        await pool.query(
          `INSERT INTO contractor_favorites (id, contractor_id, favorite_type, favorite_company_name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, auth.userId, "company", favoriteCompanyName]
        );
      }
      return res.json({ ok: true, id });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  });
  app2.delete("/api/favorites/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await pool.query(`DELETE FROM contractor_favorites WHERE id = $1 AND contractor_id = $2`, [req.params.id, auth.userId]);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  });
  app2.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      await pool.query(`UPDATE job_assignments SET vehicle_id = $1 WHERE id = $2`, [vid, req.params.assignmentId]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/vehicle`, auth, { method: "PUT", body: req.body }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to assign vehicle" });
    }
  });
  app2.post("/api/jobs/:id/clock-in", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const existingRun = await pool.query(
        `SELECT id FROM job_runs WHERE job_id = $1 AND driver_id = $2 AND status::text = 'active'`,
        [req.params.id, auth.userId]
      );
      if (existingRun.rows.length > 0) {
        const result2 = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [existingRun.rows[0].id]);
        return res.json(addDualKeys(result2.rows[0]));
      }
      const otherActive = await pool.query(
        `SELECT jr.id, jr.job_id, j.material
         FROM job_runs jr
         LEFT JOIN jobs j ON j.id = jr.job_id
         WHERE jr.driver_id = $1 AND jr.status::text = 'active' AND jr.job_id != $2
         LIMIT 1`,
        [auth.userId, req.params.id]
      );
      if (otherActive.rows.length > 0) {
        const other = otherActive.rows[0];
        return res.status(409).json({
          code: "ALREADY_CLOCKED_IN",
          message: `You're already clocked into another job${other.material ? ` (${other.material})` : ""}. Clock out first.`,
          activeJobId: other.job_id,
          activeRunId: other.id
        });
      }
      const jobRes = await pool.query(
        `SELECT id, scheduled_date, pickup_time, origin_lat, origin_lng, destination_lat, destination_lng
         FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });
      const now = /* @__PURE__ */ new Date();
      const customTime = req.body?.custom_time || req.body?.customTime || null;
      const startedAt = customTime ? new Date(customTime) : now;
      if (customTime && (isNaN(startedAt.getTime()) || startedAt.getTime() > now.getTime() + 6e4)) {
        return res.status(400).json({ code: "INVALID_TIME", message: "Clock-in time can't be in the future." });
      }
      if (job.scheduled_date) {
        const dateStr = String(job.scheduled_date).substring(0, 10);
        const [y, m, d] = dateStr.split("-").map(Number);
        let scheduledStart;
        if (job.pickup_time) {
          const [hh, mm] = String(job.pickup_time).split(":").map(Number);
          scheduledStart = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
        } else {
          scheduledStart = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
        }
        const earliest = new Date(scheduledStart.getTime() - 30 * 60 * 1e3);
        if (startedAt < earliest) {
          const diffMin = Math.ceil((earliest.getTime() - startedAt.getTime()) / 6e4);
          const startStr = scheduledStart.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
          });
          return res.status(400).json({
            code: "TOO_EARLY",
            message: `Clock-in opens 30 min before the scheduled start (${startStr}). Try again in ${diffMin} min.`,
            earliestAt: earliest.toISOString(),
            scheduledStartAt: scheduledStart.toISOString()
          });
        }
      }
      const startLat = req.body?.lat ?? req.body?.start_lat ?? null;
      const startLng = req.body?.lng ?? req.body?.start_lng ?? null;
      const GEOFENCE_MILES = 15;
      const haversineMiles = (lat1, lng1, lat2, lng2) => {
        const toRad = (v) => v * Math.PI / 180;
        const R = 3958.7613;
        const dLat2 = toRad(lat2 - lat1);
        const dLng2 = toRad(lng2 - lng1);
        const a = Math.sin(dLat2 / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng2 / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
      };
      const distanceToSegmentMiles = (pLat, pLng, aLat, aLng, bLat, bLng) => {
        const meanLatRad = (aLat + bLat) / 2 * Math.PI / 180;
        const milesPerDegLat = 69;
        const milesPerDegLng = 69 * Math.cos(meanLatRad);
        const ax = aLng * milesPerDegLng, ay = aLat * milesPerDegLat;
        const bx = bLng * milesPerDegLng, by = bLat * milesPerDegLat;
        const px = pLng * milesPerDegLng, py = pLat * milesPerDegLat;
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      };
      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      const hasJobCoords = oLat != null && oLng != null || dLat != null && dLng != null;
      if (hasJobCoords) {
        if (startLat == null || startLng == null) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again."
          });
        }
        const driverLat = Number(startLat);
        const driverLng = Number(startLng);
        if (isNaN(driverLat) || isNaN(driverLng)) {
          return res.status(400).json({ code: "LOCATION_REQUIRED", message: "Invalid location data." });
        }
        let closest;
        if (oLat != null && oLng != null && dLat != null && dLng != null) {
          closest = distanceToSegmentMiles(driverLat, driverLng, oLat, oLng, dLat, dLng);
        } else if (oLat != null && oLng != null) {
          closest = haversineMiles(driverLat, driverLng, oLat, oLng);
        } else {
          closest = haversineMiles(driverLat, driverLng, dLat, dLng);
        }
        if (closest > GEOFENCE_MILES) {
          const target = oLat != null && oLng != null && dLat != null && dLng != null ? "job route" : "job site";
          return res.status(403).json({
            code: "OUT_OF_GEOFENCE",
            message: `You're ${closest.toFixed(1)} miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} miles of pickup, dropoff, or anywhere along the route.`,
            distanceMiles: Math.round(closest * 10) / 10,
            geofenceMiles: GEOFENCE_MILES
          });
        }
      }
      const runId = crypto.randomUUID();
      const vehicleFromBody = req.body?.vehicle_id || req.body?.vehicleId || null;
      let vehicleId = vehicleFromBody;
      if (!vehicleId) {
        const vRes = await pool.query(
          `SELECT vehicle_id FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND vehicle_id IS NOT NULL AND status::text != 'rejected' LIMIT 1`,
          [req.params.id, auth.userId]
        );
        vehicleId = vRes.rows[0]?.vehicle_id || null;
      }
      await pool.query(
        `INSERT INTO job_runs (id, job_id, driver_id, vehicle_id, status, started_at, start_lat, start_lng, created_at) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, NOW())`,
        [runId, req.params.id, auth.userId, vehicleId, startedAt, startLat, startLng]
      );
      await pool.query(`UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}/start`, auth, { method: "POST", body: req.body }).catch(() => {
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
      const runRow = await pool.query(`SELECT job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      const jobIdForEnd = runRow.rows[0]?.job_id;
      await pool.query(`UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.runId]);
      if (jobIdForEnd) {
        pushToWebsite(`/api/jobs/${jobIdForEnd}/end`, auth, { method: "POST", body: { ...req.body || {}, runId: req.params.runId } }).catch(() => {
        });
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch (e) {
      console.error("Clock-out error:", e.message);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });
  app2.patch("/api/job-runs/:runId", requireAuth, async (req, res) => {
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
        values.push(req.params.runId);
        await pool.query(`UPDATE job_runs SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch {
      return res.status(500).json({ message: "Failed to update job run" });
    }
  });
  app2.delete("/api/job-runs/:runId", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = crypto.randomUUID();
      const runResult = await pool.query(`SELECT job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      const jobId = runResult.rows[0]?.job_id || null;
      await pool.query(
        `INSERT INTO weight_tickets (id, job_run_id, job_id, driver_id, weight_value, notes, image_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data]
      );
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
  app2.post("/api/conversations/:jobId/archive", requireAuth, async (_req, res) => {
    return res.json({ ok: true });
  });
  app2.post("/api/conversations/:jobId/unarchive", requireAuth, async (_req, res) => {
    return res.json({ ok: true });
  });
  app2.post("/api/conversations/:jobId/delete", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM job_messages WHERE job_id = $1`, [req.params.jobId]);
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
      const id = crypto.randomUUID();
      const body = req.body.body || req.body.message || req.body.content || "";
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [id, req.params.jobId, auth.userId, body]
      );
      pushToWebsite(`/api/jobs/${req.params.jobId}/messages`, auth, { method: "POST", body: req.body }).catch(() => {
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
      let query = `SELECT id, full_name, email, phone, truck_type, rating, total_jobs, profile_image_url, is_connected FROM users WHERE (role LIKE '%driver%' OR also_driver = true)`;
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
        `SELECT *, capacity AS max_capacity_tons FROM trucks WHERE (trucking_company_id = $1 OR assigned_driver_id = $1) AND archived_at IS NULL ORDER BY sort_order, created_at`,
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
      const id = crypto.randomUUID();
      const b = req.body;
      const truckType = b.truckType || b.truck_type;
      const licensePlate = b.licensePlate || b.license_plate || "";
      const vinNumber = b.vinNumber || b.vin_number || null;
      const truckNumber = b.truckNumber || b.truck_number || null;
      const capacity = b.maxCapacityTons || b.max_capacity_tons || b.capacity || null;
      const assignedDriverId = b.assignedDriverId || b.assigned_driver_id || null;
      const hasTarp = b.has_tarp || b.hasTarp || false;
      await pool.query(
        `INSERT INTO trucks (id, trucking_company_id, truck_type, make, model, year, license_plate, vin_number, truck_number, capacity, assigned_driver_id, has_tarp, is_active, created_at, updated_at)
         VALUES ($1, $2, $3::truck_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())`,
        [id, auth.userId, truckType, b.make, b.model, b.year, licensePlate, vinNumber, truckNumber, capacity, assignedDriverId, hasTarp]
      );
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to add vehicle" });
    }
  });
  app2.put("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const fieldMap = {
        truck_type: "truck_type",
        truckType: "truck_type",
        make: "make",
        model: "model",
        year: "year",
        license_plate: "license_plate",
        licensePlate: "license_plate",
        vin_number: "vin_number",
        vinNumber: "vin_number",
        max_capacity_tons: "capacity",
        maxCapacityTons: "capacity",
        capacity: "capacity",
        truck_number: "truck_number",
        truckNumber: "truck_number",
        assigned_driver_id: "assigned_driver_id",
        assignedDriverId: "assigned_driver_id",
        is_active: "is_active",
        isActive: "is_active",
        has_tarp: "has_tarp",
        hasTarp: "has_tarp",
        color: "color",
        sort_order: "sort_order",
        sortOrder: "sort_order",
        issue_notes: "issue_notes",
        issueNotes: "issue_notes"
      };
      const enumCols = /* @__PURE__ */ new Set(["truck_type"]);
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        const col = fieldMap[k];
        if (col && v !== void 0) {
          const cast = enumCols.has(col) ? `::truck_type` : "";
          updates.push(`${col} = $${idx}${cast}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(`UPDATE trucks SET ${updates.join(", ")} WHERE id = $${idx}`, values);
      }
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch (e) {
      console.error("PUT vehicle error:", e.message, e.detail || "");
      return res.status(500).json({ message: "Failed to update vehicle" });
    }
  });
  app2.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      deletedVehicleIds.add(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NOW(), is_active = false WHERE id = $1`, [req.params.id]);
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
    } catch (e) {
      console.error("Archive vehicle error:", e.message);
    }
    return res.json({ ok: true });
  });
  app2.get("/api/vehicles/archived", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT *, capacity AS max_capacity_tons FROM trucks WHERE (trucking_company_id = $1 OR assigned_driver_id = $1) AND archived_at IS NOT NULL ORDER BY archived_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.delete("/api/vehicles/:id/permanent", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const owned = await pool.query(
        `SELECT id, archived_at FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      if (!owned.rows[0].archived_at) {
        return res.status(400).json({ message: "Archive the vehicle before deleting it permanently" });
      }
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
      await pool.query(`DELETE FROM trucks WHERE id = $1`, [req.params.id]);
      deletedVehicleIds.add(req.params.id);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Permanent delete vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to delete vehicle" });
    }
  });
  app2.post("/api/vehicles/:id/unarchive", requireAuth, async (req, res) => {
    try {
      deletedVehicleIds.delete(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NULL, is_active = true WHERE id = $1`, [req.params.id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Unarchive vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive vehicle" });
    }
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
      const b = req.body;
      const vehicleId = b.vehicleId || b.vehicle_id || null;
      const isAvailable = b.isAvailable ?? b.is_available ?? true;
      if (vehicleId) {
        await pool.query(
          `DELETE FROM driver_availability WHERE driver_id = $1 AND date::date = $2::date AND vehicle_id = $3`,
          [auth.userId, b.date, vehicleId]
        );
        if (!isAvailable) {
          const id2 = crypto.randomUUID();
          await pool.query(
            `INSERT INTO driver_availability (id, driver_id, date, start_time, end_time, is_available, vehicle_id, notes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [id2, auth.userId, b.date, b.startTime || b.start_time || "06:00", b.endTime || b.end_time || "18:00", false, vehicleId, b.notes]
          );
        }
        pushToWebsite("/api/me/availability", auth, { method: "POST", body: req.body }).catch(() => {
        });
        const result2 = await pool.query(
          `SELECT * FROM driver_availability WHERE driver_id = $1 AND date::date = $2::date AND vehicle_id = $3 ORDER BY created_at DESC LIMIT 1`,
          [auth.userId, b.date, vehicleId]
        );
        return res.status(201).json(result2.rows[0] ? addDualKeys(result2.rows[0]) : { ok: true, status: "available" });
      }
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO driver_availability (id, driver_id, date, start_time, end_time, is_available, vehicle_id, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, auth.userId, b.date, b.startTime || b.start_time || "06:00", b.endTime || b.end_time || "18:00", isAvailable, vehicleId, b.notes]
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
  app2.get("/api/sync-status", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const status = await getSyncQueueStatus(auth.userId);
      return res.json(status);
    } catch {
      return res.json({ pending: 0, failed: 0 });
    }
  });
  app2.post("/api/sync-status/retry", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await drainSyncQueue(auth, 200);
      const status = await getSyncQueueStatus(auth.userId);
      return res.json({ ...result, ...status });
    } catch (e) {
      return res.status(500).json({ message: e.message });
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
        isContractor ? `SELECT * FROM jobs WHERE contractor_id = $1 AND status::text != 'cancelled' AND archived_at IS NULL ORDER BY created_at DESC` : `SELECT * FROM jobs WHERE (driver_id = $1 OR id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1)) AND status::text != 'cancelled' AND archived_at IS NULL ORDER BY created_at DESC`,
        [userId]
      );
      const jobs2 = jobsResult.rows;
      const openJobs = jobs2.filter((j) => j.status === "open").length;
      const activeJobs = jobs2.filter((j) => ["accepted", "in_progress", "pending"].includes(j.status)).length;
      const completedJobs = jobs2.filter((j) => j.status === "completed").length;
      const assignResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id WHERE j.contractor_id = $1 AND ja.status = 'pending'`,
        [userId]
      );
      const pendingApplications = assignResult.rows[0]?.count || 0;
      const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      const user = userResult.rows[0];
      const invoicesResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total, COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued', 'payment_sent') THEN total_amount ELSE 0 END), 0)::float as awaiting FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`,
        [userId]
      );
      let activeFleetRuns = [];
      if (role === "trucking_company" || role.includes("trucking")) {
        try {
          const fleetRunsResult = await pool.query(
            `SELECT jr.id as run_id, jr.job_id, jr.started_at as clock_in_time, jr.vehicle_id, jr.driver_id,
                    t.truck_number, t.make as truck_make, t.model as truck_model, t.year as truck_year,
                    j.material, j.origin_address,
                    c.full_name as contractor_name, c.company as contractor_company,
                    cp.name as project_name,
                    u.full_name as driver_name
             FROM job_runs jr
             JOIN trucks t ON jr.vehicle_id = t.id
             JOIN jobs j ON jr.job_id = j.id
             LEFT JOIN users c ON j.contractor_id = c.id
             LEFT JOIN contractor_projects cp ON j.project_id = cp.id
             LEFT JOIN users u ON jr.driver_id = u.id
             WHERE t.trucking_company_id = $1 AND jr.status::text = 'active'
             ORDER BY jr.started_at ASC`,
            [userId]
          );
          activeFleetRuns = fleetRunsResult.rows.map((r) => {
            const row = addDualKeys(r);
            row.vehicleDesc = [r.truck_year, r.truck_make, r.truck_model].filter(Boolean).join(" ");
            row.driverFullName = r.driver_name || "";
            return row;
          });
        } catch (fleetErr) {
          console.error("Fleet runs query error:", fleetErr.message);
        }
      }
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const horizonDays = 7;
      const lastDay = new Date(today);
      lastDay.setDate(today.getDate() + horizonDays - 1);
      const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const startDateStr = fmtDate(today);
      const endDateStr = fmtDate(lastDay);
      const isContractorOnly = role.includes("contractor") && role !== "trucking_company";
      let userTrucks = [];
      let truckAssignments = [];
      let contractorJobsForDays = [];
      if (isContractorOnly) {
        try {
          const cjRes = await pool.query(
            `SELECT j.id,
                    j.material,
                    j.scheduled_date,
                    COALESCE(j.estimated_days, 1)::numeric AS estimated_days,
                    COALESCE(j.includes_weekends, false) AS includes_weekends,
                    COALESCE(j.includes_saturday, true)  AS includes_saturday,
                    COALESCE(j.includes_sunday, true)    AS includes_sunday,
                    j.status::text AS job_status,
                    COALESCE(j.trucks_needed, 1)::int AS trucks_needed,
                    cp.name AS project_name,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id AND ja.status::text = 'approved') AS trucks_assigned,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id) AS applications_count
               FROM jobs j
               LEFT JOIN contractor_projects cp ON j.project_id = cp.id
              WHERE j.contractor_id = $1
                AND j.archived_at IS NULL
                AND j.status::text NOT IN ('cancelled', 'completed')
                AND j.scheduled_date IS NOT NULL
                AND j.scheduled_date::date <= $3::date
                AND (
                  j.scheduled_date::date >= $2::date
                  OR (
                    COALESCE(j.estimated_days, 1)::numeric > 1
                    AND (j.scheduled_date::date
                         + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day'
                        )::date >= $2::date
                  )
                )`,
            [userId, startDateStr, endDateStr]
          );
          contractorJobsForDays = cjRes.rows.map((row) => ({
            ...row,
            workingDates: new Set(
              getJobDateRange(
                typeof row.scheduled_date === "string" ? row.scheduled_date : row.scheduled_date?.toISOString?.() || String(row.scheduled_date),
                Number(row.estimated_days || 1),
                !!row.includes_weekends,
                row.includes_saturday !== false,
                row.includes_sunday !== false
              )
            )
          }));
        } catch (e) {
          console.error("Upcoming-days contractor jobs query error:", e.message);
        }
      } else {
        try {
          const trucksRes = await pool.query(
            `SELECT id, truck_number, year, make, model
               FROM trucks
              WHERE trucking_company_id = $1 AND archived_at IS NULL
              ORDER BY NULLIF(regexp_replace(COALESCE(truck_number, ''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
                       truck_number`,
            [userId]
          );
          userTrucks = trucksRes.rows;
        } catch {
        }
      }
      if (userTrucks.length > 0) {
        try {
          const asmtRes = await pool.query(
            `SELECT
               ja.vehicle_id, ja.job_id, ja.driver_id,
               j.scheduled_date,
               COALESCE(j.estimated_days, 1)::numeric AS estimated_days,
               COALESCE(j.includes_weekends, false) AS includes_weekends,
               COALESCE(j.includes_saturday, true)  AS includes_saturday,
               COALESCE(j.includes_sunday, true)    AS includes_sunday,
               j.material, j.status::text AS job_status, j.contractor_id,
               contractor.full_name AS contractor_name,
               contractor.company   AS contractor_company,
               cp.name AS project_name
             FROM job_assignments ja
             JOIN trucks t ON ja.vehicle_id = t.id
             JOIN jobs   j ON ja.job_id     = j.id
             LEFT JOIN users               contractor ON j.contractor_id = contractor.id
             LEFT JOIN contractor_projects cp         ON j.project_id    = cp.id
             WHERE t.trucking_company_id = $1
               AND t.archived_at IS NULL
               AND ja.status::text = 'approved'
               AND j.archived_at IS NULL
               AND j.status::text NOT IN ('cancelled', 'completed')
               AND j.scheduled_date::date <= $3::date
               AND (
                 j.scheduled_date::date >= $2::date
                 OR (
                   COALESCE(j.estimated_days, 1)::numeric > 1
                   AND (j.scheduled_date::date
                        + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day'
                       )::date >= $2::date
                 )
               )`,
            [userId, startDateStr, endDateStr]
          );
          truckAssignments = asmtRes.rows.map((row) => ({
            ...row,
            workingDates: new Set(
              getJobDateRange(
                typeof row.scheduled_date === "string" ? row.scheduled_date : row.scheduled_date?.toISOString?.() || String(row.scheduled_date),
                Number(row.estimated_days || 1),
                !!row.includes_weekends,
                row.includes_saturday !== false,
                row.includes_sunday !== false
              )
            )
          }));
        } catch (e) {
          console.error("Upcoming-days assignments query error:", e.message);
        }
      }
      const isBusinessDay = (d) => d.getDay() !== 0 && d.getDay() !== 6;
      const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const upcomingDays = [];
      for (let i = 0; i < horizonDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dDateStr = fmtDate(d);
        if (isContractorOnly) {
          const dayJobs = contractorJobsForDays.filter(
            (j) => j.workingDates && j.workingDates.has(dDateStr)
          );
          upcomingDays.push({
            date: dDateStr,
            dayName: dayNames[d.getDay()],
            dayNum: d.getDate(),
            isBusinessDay: isBusinessDay(d),
            status: dayJobs.length > 0 ? "jobs" : "available",
            trucksTotal: 0,
            trucksBooked: 0,
            trucksAvailable: 0,
            trucks: [],
            jobs: dayJobs.map((j) => ({
              id: j.id,
              material: j.material,
              projectName: j.project_name || "",
              trucksNeeded: j.trucks_needed || 1,
              assigned: j.trucks_assigned || 0,
              applied: j.applications_count || 0,
              status: j.job_status
            }))
          });
          continue;
        }
        const dayAssignments = truckAssignments.filter(
          (a) => a.workingDates && a.workingDates.has(dDateStr)
        );
        const trucksRendered = userTrucks.map((t) => {
          const a = dayAssignments.find((x) => x.vehicle_id === t.id);
          const base = {
            id: t.id,
            truckNumber: t.truck_number,
            vehicleDesc: [t.year, t.make, t.model].filter(Boolean).join(" ")
          };
          if (!a) return { ...base, booked: false };
          return {
            ...base,
            booked: true,
            jobId: a.job_id,
            jobMaterial: a.material,
            jobStatus: a.job_status,
            contractorName: a.contractor_name,
            contractorCompany: a.contractor_company,
            projectName: a.project_name
          };
        });
        const trucksBooked = trucksRendered.filter((t) => t.booked).length;
        const trucksTotal = userTrucks.length;
        const trucksAvailable = trucksTotal - trucksBooked;
        upcomingDays.push({
          date: dDateStr,
          dayName: dayNames[d.getDay()],
          dayNum: d.getDate(),
          isBusinessDay: isBusinessDay(d),
          status: trucksBooked > 0 ? "booked" : "available",
          trucksTotal,
          trucksBooked,
          trucksAvailable,
          trucks: trucksRendered,
          jobs: dayAssignments.map((a) => ({
            id: a.job_id,
            material: a.material,
            projectName: a.project_name || "",
            contractorName: a.contractor_name || "",
            trucksNeeded: 1,
            assigned: 1,
            status: a.job_status,
            assignmentStatus: "approved"
          }))
        });
      }
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
        status: user?.is_connected ? "online" : "offline",
        upcomingDays,
        activeFleetRuns,
        fleetActiveRuns: activeFleetRuns
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
                COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued', 'payment_sent') THEN total_amount ELSE 0 END), 0)::float as pending
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
      let query = `SELECT j.*, cp.name as project_name,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'pending'), 0) as pending_applications,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'approved'), 0) as approved_assignments
        FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.contractor_id = $1 AND j.archived_at IS NULL`;
      const params = [contractorId];
      let paramIdx = 2;
      const singleDate = req.query.date;
      if (singleDate) {
        query += ` AND (
          j.scheduled_date::date = $${paramIdx}::date
          OR (
            j.scheduled_date::date < $${paramIdx}::date
            AND COALESCE(j.estimated_days, 1)::numeric > 1
            AND (j.scheduled_date::date + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day')::date >= $${paramIdx}::date
          )
        )`;
        params.push(singleDate);
        paramIdx++;
      }
      if (projectFilter) {
        query += ` AND j.project_id = $${paramIdx}`;
        params.push(projectFilter);
        paramIdx++;
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === "in_progress" || statusLower === "active") {
          query += ` AND j.status::text IN ('in_progress', 'accepted', 'pending')`;
        } else if (statusLower === "open") {
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')`;
        } else {
          query += ` AND j.status::text = $${paramIdx}`;
          params.push(statusLower);
          paramIdx++;
        }
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;
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
         AND j.archived_at IS NULL
         ORDER BY j.created_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  function getJobDateRange(scheduledDate, estimatedDays, includesWeekends, includesSaturday = true, includesSunday = true) {
    const startDate = new Date(scheduledDate);
    if (isNaN(startDate.getTime())) return [];
    const days = Math.max(1, Math.ceil(estimatedDays || 1));
    const dates = [];
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    let added = 0;
    while (added < days) {
      const dow = current.getUTCDay();
      const isWeekendDay = dow === 0 || dow === 6;
      const dayAllowed = !isWeekendDay ? true : includesWeekends && (dow === 6 && includesSaturday || dow === 0 && includesSunday);
      if (dayAllowed) {
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
      const userRole = (auth.user?.role || "").toLowerCase();
      if (role === "contractor") {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else if (userRole === "trucking_company") {
        result = await pool.query(
          `SELECT DISTINCT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE j.id IN (SELECT ja.job_id FROM job_assignments ja JOIN trucks t ON ja.vehicle_id = t.id WHERE t.trucking_company_id = $1 AND ja.status::text NOT IN ('withdrawn', 'rejected'))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      }
      return result.rows.map(addDualKeys);
    } catch (e) {
      console.error("getJobsForCalendar error:", e.message);
    }
    return [];
  }
  app2.get("/api/calendar/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const userId = auth.userId;
      const userRole = (auth.user?.role || "").toLowerCase();
      const isContractorRole = userRole.includes("contractor") && userRole !== "trucking_company";
      const allJobs = await getJobsForCalendar(auth, isContractorRole ? "contractor" : "driver");
      const month = parseInt(req.query.month) || (/* @__PURE__ */ new Date()).getMonth() + 1;
      const year = parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear();
      const activeStatuses = /* @__PURE__ */ new Set(["open", "in_progress", "accepted", "pending"]);
      const myJobs = allJobs.filter((j) => {
        if (isContractorRole) {
          const cId = j.contractorId || j.contractor_id;
          if (String(cId) !== String(userId)) return false;
        }
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
      const jobIds = myJobs.map((j) => j.id).filter(Boolean);
      let assignmentsByJob = {};
      if (jobIds.length > 0) {
        try {
          const assResult = await pool.query(
            `SELECT ja.job_id, ja.vehicle_id, ja.status, t.make, t.model, t.year, t.truck_number, t.license_plate, t.truck_type
             FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id
             WHERE ja.job_id = ANY($1) AND ja.status::text NOT IN ('withdrawn', 'rejected')`,
            [jobIds]
          );
          for (const row of assResult.rows) {
            if (!assignmentsByJob[row.job_id]) assignmentsByJob[row.job_id] = [];
            assignmentsByJob[row.job_id].push({
              vehicleId: row.vehicle_id,
              status: row.status,
              make: row.make,
              model: row.model,
              year: row.year,
              truckNumber: row.truck_number,
              licensePlate: row.license_plate,
              truckType: row.truck_type
            });
          }
        } catch {
        }
      }
      let activeRunsByJob = {};
      if (jobIds.length > 0) {
        try {
          const runsResult = await pool.query(
            `SELECT job_id, started_at, vehicle_id FROM job_runs WHERE job_id = ANY($1) AND status::text = 'active'`,
            [jobIds]
          );
          for (const row of runsResult.rows) {
            if (!activeRunsByJob[row.job_id]) activeRunsByJob[row.job_id] = [];
            activeRunsByJob[row.job_id].push({ started_at: row.started_at, vehicle_id: row.vehicle_id });
          }
        } catch {
        }
      }
      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const includesSat = (job.includesSaturday ?? job.includes_saturday) !== false;
        const includesSun = (job.includesSunday ?? job.includes_sunday) !== false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends, includesSat, includesSun);
        const vehicleAssignments = assignmentsByJob[job.id] || [];
        const activeRuns = activeRunsByJob[job.id] || [];
        const activeAssignments = vehicleAssignments.filter((a) => a.status !== "rejected" && a.status !== "withdrawn");
        const entriesToAdd = [];
        if (activeAssignments.length > 1) {
          for (const assignment of activeAssignments) {
            const truckActiveRuns = activeRuns.filter((r) => String(r.vehicle_id) === String(assignment.vehicleId));
            entriesToAdd.push({
              ...job,
              vehicleAssignments,
              activeRuns: truckActiveRuns,
              assignmentStatus: assignment.status === "pending" ? "pending" : "approved",
              vehicle: { id: assignment.vehicleId, make: assignment.make, model: assignment.model, year: assignment.year, truckNumber: assignment.truckNumber, licensePlate: assignment.licensePlate, truckType: assignment.truckType }
            });
          }
        } else {
          const enrichedJob = { ...job, vehicleAssignments, activeRuns };
          if (activeAssignments.length === 1) {
            enrichedJob.vehicle = { id: activeAssignments[0].vehicleId, make: activeAssignments[0].make, model: activeAssignments[0].model, year: activeAssignments[0].year, truckNumber: activeAssignments[0].truckNumber, licensePlate: activeAssignments[0].licensePlate, truckType: activeAssignments[0].truckType };
            enrichedJob.assignmentStatus = activeAssignments[0].status === "pending" ? "pending" : "approved";
          }
          entriesToAdd.push(enrichedJob);
        }
        for (const entry of entriesToAdd) {
          jobDates.forEach((dateKey, idx) => {
            if (idx === 0) {
              addToDay(dateKey, entry);
            } else {
              addToDay(dateKey, { ...entry, isMultiDay: true, dayNumber: idx + 1, totalDays: jobDates.length });
            }
          });
        }
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
      const activeStatuses = /* @__PURE__ */ new Set(["open", "in_progress", "accepted", "pending"]);
      const myJobs = allJobs.filter((j) => {
        const cId = j.contractorId || j.contractor_id;
        const status = (j.status || "").toLowerCase();
        if (String(cId) !== String(contractorId)) return false;
        return activeStatuses.has(status);
      });
      const assignmentCounts = {};
      try {
        const jobIds = myJobs.map((j) => j.id);
        if (jobIds.length > 0) {
          const placeholders = jobIds.map((_, i) => `$${i + 1}`).join(",");
          const acResult = await pool.query(
            `SELECT job_id, 
              COUNT(*) FILTER (WHERE status::text = 'approved') as approved,
              COUNT(*) FILTER (WHERE status::text = 'pending') as pending,
              COUNT(*) FILTER (WHERE status::text NOT IN ('rejected', 'withdrawn')) as applied
            FROM job_assignments WHERE job_id IN (${placeholders}) AND status::text NOT IN ('rejected', 'withdrawn') GROUP BY job_id`,
            jobIds
          );
          for (const row of acResult.rows) {
            assignmentCounts[row.job_id] = { approved: parseInt(row.approved) || 0, pending: parseInt(row.pending) || 0, applied: parseInt(row.applied) || 0 };
          }
        }
      } catch {
      }
      const dailyJobs = {};
      const dailyCapacity = {};
      const addToDay = (dateKey, jobEntry) => {
        const [y, m] = dateKey.split("-").map(Number);
        if (y !== year || m !== month) return;
        if (!dailyJobs[dateKey]) dailyJobs[dateKey] = [];
        const ac = assignmentCounts[jobEntry.id] || { approved: 0, pending: 0, applied: 0 };
        dailyJobs[dateKey].push({ ...jobEntry, approved: ac.approved, pending: ac.pending, applied: ac.applied });
        const trucksNeeded = jobEntry.trucksNeeded || jobEntry.trucks_needed || 0;
        if (!dailyCapacity[dateKey]) dailyCapacity[dateKey] = { booked: 0, pending: 0, needed: 0, jobCount: 0 };
        dailyCapacity[dateKey].booked += ac.approved;
        dailyCapacity[dateKey].pending += ac.pending;
        dailyCapacity[dateKey].needed += trucksNeeded;
        dailyCapacity[dateKey].jobCount += 1;
      };
      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const includesSat = (job.includesSaturday ?? job.includes_saturday) !== false;
        const includesSun = (job.includesSunday ?? job.includes_sunday) !== false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends, includesSat, includesSun);
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
    } catch (e) {
      console.error("Calendar capacity error:", e.message);
      return res.json({ fleetSize: 0, dailyCapacity: {}, dailyJobs: {} });
    }
  });
  async function computeJobEarnings(job) {
    const runsRes = await pool.query(
      `SELECT id, started_at, ended_at, actual_duration_minutes, billed_duration_minutes, loads_hauled, status
       FROM job_runs WHERE job_id = $1`,
      [job.id]
    );
    let totalMinutes = 0;
    let totalLoads = 0;
    for (const r of runsRes.rows) {
      const billed = r.billed_duration_minutes != null ? Number(r.billed_duration_minutes) : null;
      const actual = r.actual_duration_minutes != null ? Number(r.actual_duration_minutes) : null;
      let mins = 0;
      if (billed != null) mins = billed;
      else if (actual != null) mins = actual;
      else if (r.started_at && r.ended_at) {
        mins = Math.max(0, (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 6e4);
      } else if (r.started_at && r.status !== "completed") {
        mins = Math.max(0, (Date.now() - new Date(r.started_at).getTime()) / 6e4);
      }
      totalMinutes += mins;
      totalLoads += Number(r.loads_hauled || 0);
    }
    const rate = Number(job.rate || 0);
    let earnings = 0;
    switch (job.rate_type) {
      case "per_hour":
        earnings = totalMinutes / 60 * rate;
        break;
      case "per_load":
        earnings = totalLoads * rate;
        break;
      case "flat":
      case "per_job":
        earnings = rate;
        break;
      default:
        earnings = totalMinutes / 60 * rate;
    }
    return { earnings, totalMinutes, totalLoads, runs: runsRes.rows };
  }
  async function recomputeInvoice(invoice) {
    const isOpen = invoice.status === "open";
    let jobsRes;
    if (isOpen) {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.* FROM jobs j
         LEFT JOIN job_runs jr ON jr.job_id = j.id
         WHERE j.invoice_id = $1
            OR (j.contractor_id = $2
                AND (j.driver_id = $3 OR jr.driver_id = $3)
                AND j.status::text IN ('completed', 'in_progress', 'accepted')
                AND (j.invoice_id IS NULL OR j.invoice_id = $1))`,
        [invoice.id, invoice.contractor_id, invoice.driver_id]
      );
    } else {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.* FROM jobs j WHERE j.invoice_id = $1`,
        [invoice.id]
      );
    }
    let total = 0;
    const enrichedJobs = [];
    for (const job of jobsRes.rows) {
      const calc = await computeJobEarnings(job);
      total += calc.earnings;
      enrichedJobs.push({
        ...job,
        computed_earnings: Number(calc.earnings.toFixed(2)),
        computed_total_minutes: Math.round(calc.totalMinutes),
        computed_total_loads: calc.totalLoads
      });
    }
    return { jobs: enrichedJobs, total: Number(total.toFixed(2)), jobCount: enrichedJobs.length };
  }
  app2.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const status = req.query.status;
      const includeHidden = req.query.include_hidden === "1" || req.query.include_hidden === "true";
      let query = `
        SELECT mi.*,
          c.full_name AS contractor_name, c.company AS contractor_company,
          c.email AS contractor_email, c.phone AS contractor_phone,
          c.address AS contractor_address, c.city AS contractor_city,
          c.state AS contractor_state, c.zip_code AS contractor_zip,
          d.full_name AS driver_name, d.company AS driver_company,
          d.email AS driver_email, d.phone AS driver_phone,
          d.address AS driver_address, d.city AS driver_city,
          d.state AS driver_state, d.zip_code AS driver_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        WHERE (mi.contractor_id = $1 OR mi.driver_id = $1)`;
      const params = [auth.userId];
      if (!includeHidden) {
        query += ` AND mi.hidden_at IS NULL`;
      }
      if (status) {
        params.push(status.toLowerCase());
        query += ` AND mi.status::text = $${params.length}`;
      }
      query += ` ORDER BY mi.created_at DESC`;
      const result = await pool.query(query, params);
      const recomputed = await Promise.all(result.rows.map(async (row) => {
        if (row.status === "open") {
          try {
            const calc = await recomputeInvoice(row);
            row.total_amount = calc.total;
            row.job_count = calc.jobCount;
          } catch (e) {
          }
        }
        return row;
      }));
      return res.json(recomputed.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/invoices error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT mi.*,
          c.full_name AS contractor_name, c.company AS contractor_company,
          c.email AS contractor_email, c.phone AS contractor_phone,
          c.address AS contractor_address, c.city AS contractor_city,
          c.state AS contractor_state, c.zip_code AS contractor_zip,
          d.full_name AS driver_name, d.company AS driver_company,
          d.email AS driver_email, d.phone AS driver_phone,
          d.address AS driver_address, d.city AS driver_city,
          d.state AS driver_state, d.zip_code AS driver_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        WHERE mi.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const invoice = result.rows[0];
        const calc = await recomputeInvoice(invoice);
        invoice.jobs = calc.jobs.map(addDualKeys);
        invoice.total_amount = calc.total;
        invoice.job_count = calc.jobCount;
        return res.json(addDualKeys(invoice));
      }
      return res.status(404).json({ message: "Invoice not found" });
    } catch (e) {
      console.error("GET /api/invoices/:id error:", e.message);
      return res.status(500).json({ message: "Failed to load invoice" });
    }
  });
  app2.put("/api/invoices/:id/status", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { status } = req.body;
      await pool.query(`UPDATE monthly_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
      pushToWebsite(`/api/invoices/${req.params.id}/status`, auth, { method: "POST", body: req.body }).catch(() => {
      });
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch {
      return res.status(500).json({ message: "Failed to update invoice status" });
    }
  });
  app2.post("/api/invoices/:id/hide", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
      await pool.query(`UPDATE monthly_invoices SET hidden_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    } catch (e) {
      console.error("POST /api/invoices/:id/hide error:", e.message);
      return res.status(500).json({ message: "Failed to hide invoice" });
    }
  });
  app2.post("/api/invoices/:id/unhide", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT * FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
      await pool.query(`UPDATE monthly_invoices SET hidden_at = NULL, updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    } catch (e) {
      console.error("POST /api/invoices/:id/unhide error:", e.message);
      return res.status(500).json({ message: "Failed to unhide invoice" });
    }
  });
  app2.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const includeDeleted = req.query.include_deleted === "true";
      let query = `SELECT * FROM contractor_projects WHERE contractor_id = $1`;
      const params = [auth.userId];
      if (!includeDeleted) {
        query += ` AND deleted_at IS NULL`;
      }
      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      const projects = result.rows;
      return res.json(projects.map(addDualKeys));
    } catch (e) {
      console.error("GET /api/projects error:", e.message, e.stack?.split("\n")[1]);
      return res.json([]);
    }
  });
  app2.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const id = crypto.randomUUID();
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
      const addressChanged = req.body.siteAddress !== void 0 || req.body.site_address !== void 0 || req.body.siteLat !== void 0 || req.body.site_lat !== void 0 || req.body.siteLng !== void 0 || req.body.site_lng !== void 0;
      let cascaded = 0;
      if (addressChanged && project && project.site_address) {
        const role = (project.site_address_type || "dropoff") === "pickup" ? "pickup" : "dropoff";
        const addrCol = role === "pickup" ? "origin_address" : "destination_address";
        const latCol = role === "pickup" ? "origin_lat" : "destination_lat";
        const lngCol = role === "pickup" ? "origin_lng" : "destination_lng";
        const upd = await pool.query(
          `UPDATE jobs
              SET ${addrCol} = $1,
                  ${latCol}  = $2,
                  ${lngCol}  = $3,
                  updated_at = NOW()
            WHERE project_id = $4
              AND archived_at IS NULL
              AND status NOT IN ('completed','cancelled')`,
          [project.site_address, project.site_lat, project.site_lng, req.params.id]
        );
        cascaded = upd.rowCount || 0;
        if (cascaded > 0) {
          console.log(`PUT /api/projects/${req.params.id} cascaded address to ${cascaded} job(s) (${role})`);
        }
      }
      return res.json({ ...addDualKeys(project), cascadedJobs: cascaded });
    } catch (e) {
      console.error("PUT /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });
  app2.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const upd = await pool.query(
        `UPDATE contractor_projects SET deleted_at = NOW()
         WHERE id = $1 AND contractor_id::text = $2 RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
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
      const id = crypto.randomUUID();
      const b = req.body;
      await pool.query(
        `INSERT INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, comment, reviewer_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, b.jobId || b.job_id, auth.userId, b.revieweeId || b.reviewee_id, b.rating, b.comment, b.reviewerRole || b.reviewer_role || auth.user?.role]
      );
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
        const id = crypto.randomUUID();
        await pool.query(`INSERT INTO driver_favorites (id, contractor_id, driver_id, created_at) VALUES ($1, $2, $3, NOW())`, [id, auth.userId, req.params.driverId]);
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
      const NEAR_LIMIT_METERS = 35e4;
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("components", "country:us|country:ca");
      const hasBias = lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
      if (hasBias) {
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", "100000");
        url.searchParams.set("origin", `${lat},${lng}`);
      }
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Places API status:", data.status, data.error_message);
      }
      const raw = Array.isArray(data.predictions) ? data.predictions : [];
      const mapped = raw.map((p) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
        distance_meters: typeof p.distance_meters === "number" ? p.distance_meters : void 0
      }));
      let predictions = mapped;
      if (hasBias) {
        const local = mapped.filter(
          (p) => typeof p.distance_meters === "number" && p.distance_meters <= NEAR_LIMIT_METERS
        );
        predictions = local.length >= 1 ? local : mapped;
        predictions.sort((a, b) => {
          const da = typeof a.distance_meters === "number" ? a.distance_meters : Number.POSITIVE_INFINITY;
          const db2 = typeof b.distance_meters === "number" ? b.distance_meters : Number.POSITIVE_INFINITY;
          return da - db2;
        });
      }
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
    const latestPerUser = /* @__PURE__ */ new Map();
    for (const [, auth] of tokenToJwt) {
      latestPerUser.set(auth.userId, auth);
    }
    return Array.from(latestPerUser.values());
  }, 12e4);
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
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
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
