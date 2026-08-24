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
import bcrypt from "bcrypt";

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
  archived_at: timestamp("archived_at"),
  // Companion-only "Haul Both Ways" fields (two-leg jobs). The website doesn't
  // know these columns; sync's upsertRow only writes keys present in website
  // JSON, so these values survive periodic down-syncs.
  haul_both_ways: boolean("haul_both_ways").default(false),
  return_material: text("return_material"),
  return_amount: numeric("return_amount", { precision: 10, scale: 2 }),
  return_amount_unit: text("return_amount_unit"),
  return_origin_address: text("return_origin_address"),
  return_origin_lat: numeric("return_origin_lat", { precision: 10, scale: 7 }),
  return_origin_lng: numeric("return_origin_lng", { precision: 10, scale: 7 }),
  return_destination_address: text("return_destination_address"),
  return_destination_lat: numeric("return_destination_lat", { precision: 10, scale: 7 }),
  return_destination_lng: numeric("return_destination_lng", { precision: 10, scale: 7 })
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
  available_days: integer("available_days"),
  truck_down_status: text("truck_down_status"),
  truck_down_at: timestamp("truck_down_at")
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
    ([key, val]) => columns.has(key) && val !== void 0 && !(tableName === "jobs" && key === "visibility")
  );
  if (filteredEntries.length === 0 || !normalized[idField]) return;
  const keys = filteredEntries.map(([k]) => k);
  const values = filteredEntries.map(([, v]) => v);
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const readSticky = tableName === "notifications";
  const projectSiteSticky = tableName === "contractor_projects";
  const PROJECT_SITE_FIELDS = /* @__PURE__ */ new Set(["site_address", "site_lat", "site_lng"]);
  const updateClauses = keys.filter((k) => k !== idField).map((k) => {
    if (readSticky && k === "is_read") {
      return `is_read = (COALESCE(${tableName}.is_read, false) OR COALESCE(EXCLUDED.is_read, false))`;
    }
    if (projectSiteSticky && PROJECT_SITE_FIELDS.has(k)) {
      return `${k} = COALESCE(EXCLUDED.${k}, ${tableName}.${k})`;
    }
    return `${k} = EXCLUDED.${k}`;
  });
  const archiveGuard = ARCHIVE_PROTECTED_TABLES.has(tableName) && columns.has("archived_at");
  const withdrawnGuard = tableName === "job_assignments" && columns.has("status");
  const jobTerminalGuard = tableName === "jobs" && columns.has("status");
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
    if (jobTerminalGuard) {
      const incomingStatus = String(normalized["status"] ?? "").toLowerCase();
      if (incomingStatus !== "completed" && incomingStatus !== "cancelled") {
        const prefix = whereClause ? " AND " : " WHERE ";
        whereClause += `${prefix}${tableName}.status::text NOT IN ('completed', 'cancelled')`;
      }
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
    if (String(auth.user?.role || "").includes("broker")) {
      const brokerJobs = await websiteFetchSync("/api/broker/jobs", { jwt: auth.jwt });
      if (Array.isArray(brokerJobs)) {
        const seen = new Set(jobs2.map((j) => String(j.id)));
        const extras = brokerJobs.filter(
          (j) => j?.id && !seen.has(String(j.id)) && !hiddenJobIds.has(j.id)
        );
        if (extras.length > 0) {
          console.log(`[syncJobs] merging ${extras.length} broker-feed job(s) missing from /api/jobs:`, extras.map((j) => j.id));
          jobs2 = [...jobs2, ...extras];
        }
      }
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
      const ALLOWED_RESTORE = /* @__PURE__ */ new Set(["open", "accepted", "pending", "in_progress"]);
      const nonTerminal = [];
      for (const wj of jobs2) {
        const st = String(wj.status || "").toLowerCase();
        if (!ALLOWED_RESTORE.has(st)) continue;
        const lid = websiteIdToLocalId[String(wj.id)] || String(wj.id);
        nonTerminal.push([lid, st]);
      }
      if (nonTerminal.length > 0) {
        const res = await pool.query(
          `UPDATE jobs j
             SET status = w.status::job_status, cancelled_at = NULL, archived_at = NULL
           FROM (SELECT unnest($1::varchar[]) AS id, unnest($2::text[]) AS status) w
           WHERE j.id = w.id
             AND j.status::text = 'cancelled'
             AND COALESCE(j.cancelled_at, j.archived_at) < NOW() - INTERVAL '15 minutes'
             AND j.id NOT IN (
               SELECT (body->>'id')::text FROM sync_queue
               WHERE user_id = $3 AND succeeded_at IS NULL AND body ? 'id'
               UNION
               SELECT regexp_replace(path, '^/api/jobs/([^/]+).*$', '\\1') FROM sync_queue
               WHERE user_id = $3 AND succeeded_at IS NULL AND path ~ '^/api/jobs/[^/]+'
             )
           RETURNING j.id`,
          [nonTerminal.map(([id]) => id), nonTerminal.map(([, st]) => st), auth.userId]
        );
        if (res.rows.length > 0) {
          console.log(`[syncJobs resurrect] restored ${res.rows.length} falsely-cancelled local job(s):`, res.rows.map((r) => r.id));
        }
      }
    } catch (e) {
      console.error("syncJobs resurrect error:", e.message);
    }
    try {
      await pool.query(
        `UPDATE jobs j SET visibility = 'private'
         WHERE j.visibility IS NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.id::text = j.contractor_id::text AND u.role::text = 'broker')`
      );
    } catch {
    }
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
      const { role, password, is_admin, isAdmin, is_suspended, isSuspended, ...safeUser } = auth.user;
      await upsertRow("users", safeUser);
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

// server/push-payload.ts
function buildExpoPushMessage(opts) {
  const sound = (opts.sound || "").trim() || "default";
  const msg = {
    to: opts.to,
    sound,
    title: opts.title,
    body: opts.body,
    data: opts.data || {},
    channelId: opts.channelId || "default",
    priority: "high",
    // 'active' lights the screen and plays sound immediately (iOS 15+).
    // 'timeSensitive' additionally breaks through Focus modes when the build
    // has the time-sensitive entitlement; APNs downgrades it to 'active' when
    // the entitlement is absent, so it is always safe to request.
    interruptionLevel: opts.interruptionLevel || "active"
  };
  if (typeof opts.badge === "number" && Number.isFinite(opts.badge) && opts.badge >= 0) {
    msg.badge = Math.floor(opts.badge);
  }
  return msg;
}
var PUSH_SOUNDS = {
  NEW_JOB: "truckhorn.wav",
  JOB_AWARDED: "cashregister.wav"
};
var PUSH_CHANNELS = {
  NEW_JOB: "job-alerts",
  JOB_AWARDED: "job-awarded"
};
function buildNewJobNearbyPush(opts) {
  return buildExpoPushMessage({
    to: opts.to,
    title: opts.title,
    body: opts.body,
    data: { type: "new_job", jobId: opts.jobId },
    sound: PUSH_SOUNDS.NEW_JOB,
    channelId: PUSH_CHANNELS.NEW_JOB,
    interruptionLevel: "timeSensitive",
    badge: opts.badge
  });
}
function buildJobAwardedPush(opts) {
  return buildExpoPushMessage({
    to: opts.to,
    title: opts.title,
    body: opts.body,
    data: { type: "job_awarded", jobId: opts.jobId },
    sound: PUSH_SOUNDS.JOB_AWARDED,
    channelId: PUSH_CHANNELS.JOB_AWARDED,
    interruptionLevel: "timeSensitive",
    badge: opts.badge
  });
}

// server/apns.ts
import { importPKCS8, SignJWT } from "jose";
import http2 from "node:http2";
var APNS_HOST = "https://api.push.apple.com";
var session = null;
var sessionCloseTimer = null;
function getSession() {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(APNS_HOST);
  session.on("error", () => {
    try {
      session?.destroy();
    } catch {
    }
    session = null;
  });
  session.on("close", () => {
    session = null;
  });
  return session;
}
function scheduleSessionClose() {
  if (sessionCloseTimer) clearTimeout(sessionCloseTimer);
  sessionCloseTimer = setTimeout(() => {
    try {
      session?.close();
    } catch {
    }
    session = null;
  }, 3e4);
  sessionCloseTimer?.unref?.();
}
function apnsRequest(path2, headers, body) {
  return new Promise((resolve2, reject) => {
    let s;
    try {
      s = getSession();
    } catch (e) {
      return reject(e);
    }
    const req = s.request({ ":method": "POST", ":path": path2, ...headers });
    const timeout = setTimeout(() => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      reject(new Error("APNs request timeout"));
    }, 1e4);
    let status = 0;
    let data = "";
    req.on("response", (h) => {
      status = Number(h[":status"] || 0);
    });
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => {
      clearTimeout(timeout);
      scheduleSessionClose();
      resolve2({ status, body: data });
    });
    req.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    req.end(body);
  });
}
var TOPIC_CANDIDATES = [
  process.env.APNS_BUNDLE_ID || "app.replit.loadlink",
  "com.loadlink.app"
].filter((v, i, a) => a.indexOf(v) === i);
var workingTopic = null;
var cachedJwt = null;
function apnsConfigured() {
  return Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APPLE_TEAM_ID);
}
async function getApnsJwt() {
  const now = Math.floor(Date.now() / 1e3);
  if (cachedJwt && cachedJwt.exp > now + 60) return cachedJwt.token;
  let pem = (process.env.APNS_KEY_P8 || "").replace(/\\n/g, "\n").trim();
  if (!pem.includes("-----BEGIN")) {
    const b64 = pem.replace(/\s+/g, "");
    pem = `-----BEGIN PRIVATE KEY-----
${b64.replace(/(.{64})/g, "$1\n").trim()}
-----END PRIVATE KEY-----`;
  } else if (!pem.includes("\n")) {
    const m = pem.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/s);
    if (m) {
      const b64 = m[1].replace(/\s+/g, "");
      pem = `-----BEGIN PRIVATE KEY-----
${b64.replace(/(.{64})/g, "$1\n").trim()}
-----END PRIVATE KEY-----`;
    }
  }
  const key = await importPKCS8(pem, "ES256");
  const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: (process.env.APNS_KEY_ID || "").trim().toUpperCase() }).setIssuer((process.env.APPLE_TEAM_ID || "").trim().toUpperCase()).setIssuedAt(now).sign(key);
  cachedJwt = { token, exp: now + 45 * 60 };
  return token;
}
function toApnsPayload(msg) {
  const aps = {
    alert: { title: msg.title, body: msg.body },
    sound: msg.sound,
    "interruption-level": msg.interruptionLevel === "timeSensitive" ? "time-sensitive" : msg.interruptionLevel
  };
  if (typeof msg.badge === "number") aps.badge = msg.badge;
  return { aps, ...msg.data };
}
async function sendApnsPush(deviceToken, msg) {
  if (!apnsConfigured()) return { ok: false, reason: "NotConfigured" };
  try {
    const jwt = await getApnsJwt();
    const payload = JSON.stringify(toApnsPayload(msg));
    const topics = workingTopic ? [workingTopic, ...TOPIC_CANDIDATES.filter((t) => t !== workingTopic)] : TOPIC_CANDIDATES;
    let last = { ok: false, reason: "NoTopicTried" };
    for (const topic of topics) {
      const res = await apnsRequest(`/3/device/${deviceToken}`, {
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10"
      }, payload);
      if (res.status >= 200 && res.status < 300) {
        workingTopic = topic;
        return { ok: true, status: res.status };
      }
      let reason = "";
      try {
        reason = JSON.parse(res.body)?.reason || "";
      } catch {
      }
      last = { ok: false, status: res.status, reason };
      const topicIssue = ["TopicDisallowed", "BadTopic", "DeviceTokenNotForTopic", "MissingTopic"].includes(reason);
      if (!topicIssue) return last;
    }
    return last;
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// server/visibility.ts
var RECHECK_MS = 5 * 60 * 1e3;
var cached = null;
var cachedAt = 0;
var inFlight = null;
var NONE = {
  jobsVisibility: false,
  projectsVisibility: false,
  publicPositionsRemaining: false,
  inviteTable: null
};
async function detect(pool2) {
  try {
    const cols = await pool2.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'jobs' AND column_name IN ('visibility', 'public_positions_remaining'))
           OR (table_name = 'contractor_projects' AND column_name = 'visibility'))`
    );
    const has = (t, c) => cols.rows.some((r) => r.table_name === t && r.column_name === c);
    let inviteTable = null;
    const tables = await pool2.query(
      `SELECT c.table_name, array_agg(c.column_name) AS cols
       FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name ILIKE '%project%invit%'
       GROUP BY c.table_name`
    );
    for (const row of tables.rows) {
      const cset = new Set(row.cols);
      const name = String(row.table_name);
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
        console.warn(`[Visibility] Ignoring invite table with unsafe name: ${JSON.stringify(name)}`);
        continue;
      }
      if (cset.has("project_id") && cset.has("user_id") && cset.has("status")) {
        inviteTable = `"${name}"`;
        break;
      }
    }
    return {
      jobsVisibility: has("jobs", "visibility"),
      projectsVisibility: has("contractor_projects", "visibility"),
      publicPositionsRemaining: has("jobs", "public_positions_remaining"),
      inviteTable
    };
  } catch {
    return NONE;
  }
}
async function getVisibilityFeatures(pool2) {
  const now = Date.now();
  if (cached && now - cachedAt < RECHECK_MS) return cached;
  if (!inFlight) {
    inFlight = detect(pool2).then((f) => {
      cached = f;
      cachedAt = Date.now();
      return f;
    }).finally(() => {
      inFlight = null;
    });
  }
  if (cached) return cached;
  return inFlight;
}
function jobVisibilityPredicate(feats, userParamIdx, alias = "j") {
  if (!feats.jobsVisibility) return "";
  const a = alias;
  const ownerIsBroker = `EXISTS (SELECT 1 FROM users _vo WHERE _vo.id::text = ${a}.contractor_id::text AND _vo.role::text = 'broker')`;
  const parts = [
    `(${a}.visibility IS NULL AND NOT ${ownerIsBroker})`,
    `(${a}.visibility IS NOT NULL AND ${a}.visibility::text <> 'private')`,
    `${a}.contractor_id::text = $${userParamIdx}::text`,
    `${a}.driver_id::text = $${userParamIdx}::text`,
    // Broker "send-later" rule: on a job posted by a broker, a HELD assignment
    // (sent_at IS NULL) must be completely invisible to the truck — it only
    // grants visibility once the broker sends it. Non-broker jobs are
    // unaffected (driver-created applications also have sent_at NULL).
    `EXISTS (SELECT 1 FROM job_assignments _ja WHERE _ja.job_id = ${a}.id
             AND _ja.driver_id::text = $${userParamIdx}::text
             AND _ja.status::text NOT IN ('rejected','withdrawn','cancelled','expired')
             AND (_ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users _bu
               WHERE _bu.id::text = ${a}.contractor_id::text AND _bu.role::text = 'broker')))`
  ];
  if (feats.publicPositionsRemaining) {
    parts.push(`COALESCE(${a}.public_positions_remaining, 0) > 0`);
  }
  if (feats.inviteTable) {
    parts.push(
      `EXISTS (SELECT 1 FROM ${feats.inviteTable} _pi WHERE _pi.project_id = ${a}.project_id
               AND _pi.user_id::text = $${userParamIdx}::text
               AND _pi.status::text IN ('pending','accepted'))`
    );
  }
  return ` AND (${parts.join(" OR ")})`;
}
async function canViewPrivateJob(pool2, feats, job, userId, alreadyParticipantOrAssigned) {
  if (!feats.jobsVisibility) return true;
  const vis = (job.visibility ?? "").toString();
  if (vis !== "private") {
    if (vis !== "") return true;
    try {
      const r = await pool2.query(
        `SELECT 1 FROM users WHERE id::text = $1::text AND role::text = 'broker' LIMIT 1`,
        [String(job.contractor_id)]
      );
      if (r.rows.length === 0) return true;
    } catch {
      return true;
    }
  }
  if (alreadyParticipantOrAssigned) return true;
  if (String(job.contractor_id) === String(userId)) return true;
  if (job.driver_id && String(job.driver_id) === String(userId)) return true;
  if (feats.publicPositionsRemaining && Number(job.public_positions_remaining || 0) > 0) return true;
  if (feats.inviteTable && job.project_id) {
    try {
      const r = await pool2.query(
        `SELECT 1 FROM ${feats.inviteTable}
         WHERE project_id = $1 AND user_id::text = $2::text
           AND status::text IN ('pending','accepted') LIMIT 1`,
        [job.project_id, userId]
      );
      if (r.rows.length > 0) return true;
    } catch {
    }
  }
  return false;
}

// server/routes.ts
var WEBSITE_API_URL2 = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
var WEBSITE_API_KEY2 = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";
var DATA_DIR = join(process.cwd(), ".data");
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
}
async function deliverPush(tokens, msg, label) {
  if (tokens.apnsToken && apnsConfigured()) {
    const r = await sendApnsPush(tokens.apnsToken, msg);
    if (r.ok) return;
    console.error(`${label} APNs send failed (${r.status || ""} ${r.reason || ""}) \u2014 falling back to Expo`);
  }
  if (!tokens.expoToken) return;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, to: tokens.expoToken })
    });
    const tickets = await res.json().catch(() => null);
    const t = Array.isArray(tickets?.data) ? tickets.data[0] : tickets?.data;
    if (t?.status === "error") console.error(`${label} Expo push ticket error:`, JSON.stringify(t));
  } catch (e) {
    console.error(`${label} Expo push send error:`, e.message);
  }
}
async function sendPushNotification(userId, title, body, data, sound = "default") {
  try {
    const result = await pool.query(`SELECT expo_push_token, apns_device_token FROM users WHERE id::text = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (!row || !row.expo_push_token && !row.apns_device_token) return;
    const message = buildExpoPushMessage({ to: row.expo_push_token || "", title, body, data, sound });
    await deliverPush({ expoToken: row.expo_push_token, apnsToken: row.apns_device_token }, message, "Push");
  } catch (e) {
    console.error("Push notification error:", e.message);
  }
}
async function notifyDriverJobAwarded(driverId, jobId, jobMaterial) {
  try {
    const title = "You Got the Job!";
    const body = `Your application${jobMaterial ? ` for the ${jobMaterial} job` : ""} was approved. Check the schedule for details.`;
    try {
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
         VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
        [crypto.randomUUID(), driverId, title, body, jobId]
      );
    } catch (e) {
      console.error("Job-awarded notification insert error:", e.message);
    }
    const tokenRow = await pool.query(`SELECT expo_push_token, apns_device_token FROM users WHERE id::text = $1 LIMIT 1`, [driverId]);
    const tokRow = tokenRow.rows[0];
    if (!tokRow || !tokRow.expo_push_token && !tokRow.apns_device_token) return;
    let badge;
    try {
      const c = await pool.query(
        `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id::text = $1 AND is_read = false`,
        [driverId]
      );
      badge = Number(c.rows[0]?.unread) || void 0;
    } catch {
    }
    const message = buildJobAwardedPush({ to: tokRow.expo_push_token || "", title, body, jobId, badge });
    await deliverPush({ expoToken: tokRow.expo_push_token, apnsToken: tokRow.apns_device_token }, message, "Job-awarded");
  } catch (e) {
    console.error("Job-awarded push error:", e.message);
  }
}
async function notifyBrokerAssignmentResponse(assignmentId, driverId, action) {
  const info = await pool.query(
    `SELECT ja.job_id, j.contractor_id AS broker_id, j.material, j.scheduled_date,
            bu.role::text AS poster_role, du.full_name AS driver_name
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       JOIN users bu ON bu.id::text = j.contractor_id::text
       LEFT JOIN users du ON du.id::text = $2
      WHERE ja.id = $1`,
    [assignmentId, driverId]
  );
  const row = info.rows[0];
  if (!row || String(row.poster_role) !== "broker") return;
  const brokerId = String(row.broker_id);
  const driverName = row.driver_name || "A driver";
  const rawDate = row.scheduled_date instanceof Date ? row.scheduled_date.toISOString() : String(row.scheduled_date || "");
  const dateKey = rawDate.slice(0, 10);
  const dayLabel = dateKey ? (/* @__PURE__ */ new Date(`${dateKey}T12:00:00Z`)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  let title;
  let body;
  if (action === "decline") {
    title = "Truck declined \u2014 reassign needed";
    body = `${driverName} declined the ${row.material || "job"}${dayLabel ? ` on ${dayLabel}` : ""}. The spot is open \u2014 assign another truck and send it out.`;
  } else {
    title = "Truck confirmed";
    body = `${driverName} confirmed the ${row.material || "job"}${dayLabel ? ` for ${dayLabel}` : ""}.`;
    let jwt = null;
    for (const [, a] of tokenToJwt) {
      if (a.userId === brokerId && a.jwt && !a.jwt.startsWith("dev-local:")) jwt = a.jwt;
    }
    if (jwt && dateKey) {
      try {
        const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt });
        if (jr.ok) {
          const jobs2 = await jr.json().catch(() => []);
          let confirmed = 0;
          let totalOut = 0;
          for (const job of Array.isArray(jobs2) ? jobs2 : []) {
            const jd = String(job.scheduledDate || job.scheduled_date || "").slice(0, 10);
            if (jd !== dateKey) continue;
            const s = job.assignmentStats || {};
            confirmed += Number(s.confirmed) || 0;
            totalOut += (Number(s.confirmed) || 0) + (Number(s.sent) || 0);
          }
          if (totalOut > 0) {
            if (confirmed >= totalOut) {
              title = "All trucks confirmed";
              body = `All ${totalOut} truck${totalOut === 1 ? "" : "s"} confirmed${dayLabel ? ` for ${dayLabel}` : ""}.`;
            } else {
              body = `${driverName} confirmed. ${confirmed} of ${totalOut} trucks confirmed${dayLabel ? ` for ${dayLabel}` : ""}.`;
            }
          }
        }
      } catch (e) {
        console.error("Broker tally fetch error:", e.message);
      }
    }
  }
  try {
    await pool.query(
      `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
       VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
      [crypto.randomUUID(), brokerId, title, body, row.job_id]
    );
  } catch (e) {
    console.error("Broker confirm notification insert error:", e.message);
  }
  await sendPushNotification(brokerId, title, body, {
    type: action === "decline" ? "broker_truck_declined" : "broker_truck_confirmed",
    jobId: String(row.job_id),
    date: dateKey
  });
}
async function notifyNearbyDriversOfNewJob(job) {
  try {
    const jobLat = job?.origin_lat != null ? Number(job.origin_lat) : NaN;
    const jobLng = job?.origin_lng != null ? Number(job.origin_lng) : NaN;
    if (!Number.isFinite(jobLat) || !Number.isFinite(jobLng)) return;
    const visFeats = await getVisibilityFeatures(pool);
    if (visFeats.jobsVisibility && job?.id) {
      const cols = visFeats.publicPositionsRemaining ? `visibility::text AS vis, COALESCE(public_positions_remaining, 0)::int AS ppr` : `visibility::text AS vis, 0 AS ppr`;
      const vr = await pool.query(
        `SELECT ${cols},
                EXISTS (SELECT 1 FROM users _vo WHERE _vo.id::text = jobs.contractor_id::text AND _vo.role::text = 'broker') AS owner_is_broker
         FROM jobs WHERE id = $1`,
        [String(job.id)]
      );
      const row = vr.rows[0];
      if (row && (row.vis === "private" || row.vis == null && row.owner_is_broker) && Number(row.ppr) <= 0) {
        console.log(`[JobWatcher] Job ${job.id} is private \u2014 skipping nearby-driver broadcast`);
        return;
      }
    }
    const drivers = await pool.query(
      `SELECT id::text AS id, expo_push_token, apns_device_token,
              COALESCE(search_radius_miles, 50) AS radius,
              primary_location_lat, primary_location_lng,
              secondary_location_lat, secondary_location_lng,
              tertiary_location_lat, tertiary_location_lng,
              last_known_lat, last_known_lng
       FROM users
       WHERE (role ILIKE '%driver%' OR role ILIKE '%trucking_company%' OR also_driver = true)
         AND id::text <> $1`,
      [String(job.contractor_id)]
    );
    if (drivers.rows.length === 0) return;
    const R = 3958.7613;
    const toRad = (v) => v * Math.PI / 180;
    const milesBetween = (aLat, aLng, bLat, bLng) => {
      const dLat = toRad(bLat - aLat);
      const dLng = toRad(bLng - aLng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(s));
    };
    const material = (job.material || "load").toString();
    const origin = (job.origin_address || "a nearby location").toString();
    const title = "New Job Alert";
    const body = `A ${material} haul was posted near ${origin}. Tap to apply.`;
    const recipients = [];
    const rowValues = [];
    for (const d of drivers.rows) {
      const pairs = [
        [d.primary_location_lat, d.primary_location_lng],
        [d.secondary_location_lat, d.secondary_location_lng],
        [d.tertiary_location_lat, d.tertiary_location_lng],
        [d.last_known_lat, d.last_known_lng]
      ];
      let nearest = Infinity;
      for (const [la, ln] of pairs) {
        const dLat = la != null ? Number(la) : NaN;
        const dLng = ln != null ? Number(ln) : NaN;
        if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) continue;
        if (dLat === 0 && dLng === 0) continue;
        nearest = Math.min(nearest, milesBetween(dLat, dLng, jobLat, jobLng));
      }
      const radius = Number(d.radius) || 50;
      if (nearest <= radius) {
        recipients.push({ id: String(d.id), token: d.expo_push_token || null, apnsToken: d.apns_device_token || null });
        rowValues.push(d.id);
      }
    }
    if (rowValues.length === 0) return;
    try {
      const placeholders = [];
      const params = [];
      rowValues.forEach((driverId, i) => {
        const base = i * 5;
        placeholders.push(`($${base + 1}, $${base + 2}, 'new_load', $${base + 3}, $${base + 4}, $${base + 5}, false, NOW())`);
        params.push(crypto.randomUUID(), driverId, title, body, String(job.id));
      });
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at) VALUES ${placeholders.join(", ")}`,
        params
      );
    } catch (e) {
      console.error("New-job driver notification insert error:", e.message);
    }
    const pushRecipients = recipients.filter((r) => r.token || r.apnsToken);
    if (pushRecipients.length === 0) return;
    const unreadByUser = /* @__PURE__ */ new Map();
    try {
      const counts = await pool.query(
        `SELECT user_id::text AS user_id, COUNT(*)::int AS unread
         FROM notifications
         WHERE is_read = false AND user_id::text = ANY($1)
         GROUP BY user_id`,
        [pushRecipients.map((r) => r.id)]
      );
      for (const row of counts.rows) unreadByUser.set(row.user_id, Number(row.unread));
    } catch (e) {
      console.error("New-job unread count error:", e.message);
    }
    const BATCH = 20;
    for (let i = 0; i < pushRecipients.length; i += BATCH) {
      await Promise.all(
        pushRecipients.slice(i, i + BATCH).map((r) => {
          const msg = buildNewJobNearbyPush({
            to: r.token || "",
            title,
            body,
            jobId: String(job.id),
            badge: unreadByUser.get(r.id)
          });
          return deliverPush({ expoToken: r.token, apnsToken: r.apnsToken }, msg, "New-job");
        })
      );
    }
  } catch (e) {
    console.error("notifyNearbyDriversOfNewJob error:", e.message);
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
var NOTIFIED_JOBS_FILE = "notified_jobs.json";
var _jobWatcherState = (() => {
  try {
    const parsed = JSON.parse(readFileSync(join(DATA_DIR, NOTIFIED_JOBS_FILE), "utf-8"));
    if (Array.isArray(parsed)) return { watermark: null, ids: parsed };
    return { watermark: parsed.watermark ?? null, ids: parsed.ids ?? [] };
  } catch {
    return { watermark: null, ids: [] };
  }
})();
var notifiedJobIds = new Set(_jobWatcherState.ids);
var jobWatcherWatermark = _jobWatcherState.watermark;
function saveJobWatcherState() {
  if (notifiedJobIds.size > 500) {
    const ids = [...notifiedJobIds];
    notifiedJobIds.clear();
    for (const id of ids.slice(ids.length - 500)) notifiedJobIds.add(id);
  }
  try {
    writeFileSync(
      join(DATA_DIR, NOTIFIED_JOBS_FILE),
      JSON.stringify({ watermark: jobWatcherWatermark, ids: [...notifiedJobIds] }),
      "utf-8"
    );
  } catch {
  }
}
function markJobNotified(id) {
  notifiedJobIds.add(id);
  saveJobWatcherState();
}
async function claimJobNotification(id) {
  try {
    const r = await pool.query(
      `INSERT INTO companion_notified_jobs (job_id) VALUES ($1) ON CONFLICT (job_id) DO NOTHING RETURNING job_id`,
      [id]
    );
    return r.rowCount === 1;
  } catch (e) {
    console.error("[JobWatcher] claim error:", e.message);
    return !notifiedJobIds.has(id);
  }
}
var JOB_WATCHER_MAX_CATCHUP_HOURS = 12;
async function pollForNewWebsiteJobs(seedOnly = false) {
  try {
    const since = jobWatcherWatermark ? `GREATEST($1::timestamptz, NOW() - INTERVAL '${JOB_WATCHER_MAX_CATCHUP_HOURS} hours')` : `NOW() - INTERVAL '15 minutes'`;
    const params = jobWatcherWatermark ? [jobWatcherWatermark] : [];
    const recent = await pool.query(
      `SELECT id, contractor_id, material, origin_lat, origin_lng, origin_address, created_at
       FROM jobs
       WHERE created_at > ${since}
         AND status = 'open'
         AND archived_at IS NULL
         AND id NOT LIKE 'demo-%'
       ORDER BY created_at ASC`,
      params
    );
    for (const job of recent.rows) {
      const id = String(job.id);
      const created = new Date(job.created_at).toISOString();
      if (!jobWatcherWatermark || created > jobWatcherWatermark) jobWatcherWatermark = created;
      if (notifiedJobIds.has(id) || hiddenJobIds2.has(id)) continue;
      notifiedJobIds.add(id);
      if (!seedOnly) {
        if (!await claimJobNotification(id)) continue;
        console.log(`[JobWatcher] New job ${id} detected \u2014 notifying nearby drivers`);
        notifyNearbyDriversOfNewJob(job).catch(() => {
        });
      }
    }
    saveJobWatcherState();
  } catch (e) {
    console.error("[JobWatcher] poll error:", e.message);
  }
}
function startNewJobWatcher() {
  const firstEverRun = jobWatcherWatermark === null;
  pool.query(`DELETE FROM companion_notified_jobs WHERE notified_at < NOW() - INTERVAL '7 days'`).catch(() => {
  });
  pollForNewWebsiteJobs(firstEverRun).finally(() => {
    setInterval(() => pollForNewWebsiteJobs(false), 6e4);
  });
}
async function reacquireBrokerJwt(brokerId) {
  try {
    const r = await pool.query(
      `SELECT email, is_suspended FROM users WHERE id::text = $1 LIMIT 1`,
      [brokerId]
    );
    const dbUser = r.rows[0];
    if (!dbUser?.email || dbUser.is_suspended) return null;
    const loginRes = await websiteFetch("/api/companion/auth/login", {
      method: "POST",
      body: { email: dbUser.email }
    });
    if (!loginRes.ok) {
      console.error(`[BrokerSend] re-auth refused for broker ${brokerId}: ${loginRes.status}`);
      return null;
    }
    const data = await loginRes.json().catch(() => null);
    const jwt = data?.token || data?.jwt || null;
    return typeof jwt === "string" && jwt.length > 0 ? jwt : null;
  } catch (e) {
    console.error(`[BrokerSend] re-auth error for broker ${brokerId}:`, e.message);
    return null;
  }
}
async function recoverStuckBrokerScheduledSends() {
  try {
    const r = await pool.query(
      `UPDATE broker_scheduled_sends b
       SET status = CASE WHEN b.attempts < 5 THEN 'pending' ELSE 'failed' END,
           attempts = b.attempts + 1,
           claimed_at = NULL,
           error = CASE WHEN b.attempts < 5
             THEN 'Recovered: send interrupted mid-processing (server restart); will retry'
             ELSE 'Send interrupted mid-processing (server restart); gave up after retries' END
       WHERE b.id IN (
         SELECT id FROM broker_scheduled_sends
         WHERE status = 'processing'
           AND COALESCE(claimed_at, send_at) < NOW() - INTERVAL '5 minutes'
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, status`
    );
    for (const row of r.rows) {
      console.log(`[BrokerSend] schedule ${row.id}: recovered stuck 'processing' row -> ${row.status}`);
    }
  } catch (e) {
    console.error("[BrokerSend] stuck-row recovery error:", e?.message || e);
  }
}
async function processDueBrokerScheduledSends() {
  let due = [];
  try {
    const r = await pool.query(
      `UPDATE broker_scheduled_sends SET status = 'processing', claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM broker_scheduled_sends
         WHERE status = 'pending' AND send_at <= NOW()
         ORDER BY send_at ASC LIMIT 20
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, broker_id, date, tz_offset_min, attempts`
    );
    due = r.rows;
  } catch {
    return;
  }
  for (const row of due) {
    const dateKey = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
    const tzOffsetMin = Number(row.tz_offset_min) || 0;
    const jobDayKey = (raw) => {
      if (!raw) return "";
      if (!raw.includes("T")) return raw.slice(0, 10);
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw.slice(0, 10);
      return new Date(d.getTime() - tzOffsetMin * 6e4).toISOString().slice(0, 10);
    };
    let jwt = null;
    for (const [, auth] of tokenToJwt) {
      if (auth.userId === row.broker_id && auth.jwt && !auth.jwt.startsWith("dev-local:")) jwt = auth.jwt;
    }
    if (!jwt) {
      jwt = await reacquireBrokerJwt(String(row.broker_id));
      if (jwt) {
        console.log(`[BrokerSend] schedule ${row.id}: re-authenticated broker ${row.broker_id} for scheduled send`);
      }
    }
    if (!jwt) {
      await pool.query(
        `UPDATE broker_scheduled_sends SET status = 'failed', error = 'No active login session at send time and re-auth failed' WHERE id = $1 AND status = 'processing'`,
        [row.id]
      ).catch(() => {
      });
      continue;
    }
    try {
      const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt });
      if (!jr.ok) throw new Error(`jobs fetch ${jr.status}`);
      const jobs2 = await jr.json().catch(() => []);
      let sentJobs = 0;
      const failedJobs = [];
      for (const job of Array.isArray(jobs2) ? jobs2 : []) {
        const jobDate = jobDayKey(String(job.scheduledDate || job.scheduled_date || ""));
        if (jobDate !== dateKey) continue;
        const held = (job.assignmentStats?.held || 0) > 0 || Array.isArray(job.assignments) && job.assignments.some(
          (a) => (a.sentAt ?? a.sent_at) == null && a.status !== "declined" && a.status !== "withdrawn"
        );
        if (!held) continue;
        const sr = await websiteFetch(`/api/broker/jobs/${job.id}/send-all`, { method: "POST", body: {}, jwt });
        if (sr.ok) sentJobs++;
        else {
          failedJobs.push(String(job.id));
          console.error(`[BrokerSend] send-all failed for job ${job.id}: ${sr.status}`);
        }
      }
      if (failedJobs.length > 0 && Number(row.attempts) < 5) {
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'pending', sent_jobs = $2,
             attempts = attempts + 1, error = $3 WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs, `Retrying ${failedJobs.length} job(s): ${failedJobs.join(",").slice(0, 400)}`]
        );
      } else if (failedJobs.length > 0) {
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'failed', sent_jobs = $2,
             error = $3 WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs, `Gave up after retries; failed job(s): ${failedJobs.join(",").slice(0, 400)}`]
        );
      } else {
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'sent', sent_jobs = $2, error = NULL WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs]
        );
      }
      console.log(`[BrokerSend] schedule ${row.id}: sent instructions on ${sentJobs} job(s) for ${dateKey}${failedJobs.length ? `, ${failedJobs.length} failed (will retry)` : ""}`);
    } catch (e) {
      console.error("[BrokerSend] error:", e.message);
      await pool.query(
        `UPDATE broker_scheduled_sends SET status = 'failed', error = $2 WHERE id = $1 AND status = 'processing'`,
        [row.id, String(e.message || e).slice(0, 500)]
      ).catch(() => {
      });
    }
  }
}
function sweepOldBrokerScheduledSends() {
  pool.query(
    `DELETE FROM broker_scheduled_sends
     WHERE status IN ('sent', 'failed')
       AND send_at < NOW() - INTERVAL '30 days'`
  ).then((r) => {
    if (r.rowCount) console.log(`[BrokerSend] swept ${r.rowCount} old sent/failed schedule row(s)`);
  }).catch(() => {
  });
}
function startBrokerScheduledSendWorker() {
  sweepOldBrokerScheduledSends();
  pool.query(`ALTER TABLE broker_scheduled_sends ADD COLUMN IF NOT EXISTS claimed_at timestamptz`).catch((e) => console.error("[BrokerSend] claimed_at migration error:", e?.message || e)).then(() => recoverStuckBrokerScheduledSends()).catch(() => {
  });
  setInterval(() => {
    recoverStuckBrokerScheduledSends().catch(() => {
    });
  }, 5 * 60 * 1e3);
  setInterval(() => {
    processDueBrokerScheduledSends().catch(() => {
    });
  }, 6e4);
  setInterval(sweepOldBrokerScheduledSends, 24 * 60 * 60 * 1e3);
}
function saveJsonMap(filename, map) {
  try {
    if (map.size > 200) {
      const entries2 = [...map.entries()];
      const trimmed = entries2.slice(entries2.length - 200);
      map.clear();
      for (const [k, v] of trimmed) map.set(k, v);
    }
    const entries = [...map.entries()].map(
      ([k, v]) => filename === "sessions.json" ? [k, slimSessionEntry(v)] : [k, v]
    );
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(entries), "utf-8");
  } catch {
  }
  if (filename === "sessions.json") {
    void syncSessionsToDb(map);
  }
}
var tokenToJwt = loadJsonMap("sessions.json");
function slimSessionEntry(v) {
  try {
    const user = v?.user;
    if (!user || typeof user !== "object") return v;
    let slim = null;
    for (const [k, val] of Object.entries(user)) {
      if (typeof val === "string" && val.length > 1e5) {
        if (!slim) slim = { ...user };
        delete slim[k];
      }
    }
    return slim ? { ...v, user: slim } : v;
  } catch {
    return v;
  }
}
var sessionDbReady = false;
var sessionDbChain = Promise.resolve();
function queueSessionDbOp(op) {
  sessionDbChain = sessionDbChain.then(op).catch((e) => {
    console.error("[Sessions] DB op failed:", e?.message);
  });
  return sessionDbChain;
}
async function syncSessionsToDb(map) {
  if (!sessionDbReady) return;
  const obj = {};
  for (const [k, v] of map.entries()) obj[k] = slimSessionEntry(v);
  await queueSessionDbOp(async () => {
    await pool.query(
      `INSERT INTO companion_sessions (token, entry, updated_at)
       SELECT key, value, NOW() FROM jsonb_each($1::jsonb)
       ON CONFLICT (token) DO UPDATE SET entry = EXCLUDED.entry, updated_at = NOW()`,
      [JSON.stringify(obj)]
    );
  });
}
function deleteSessionsFromDb(tokens) {
  if (!sessionDbReady || tokens.length === 0) return;
  void queueSessionDbOp(async () => {
    await pool.query(`DELETE FROM companion_sessions WHERE token = ANY($1::text[])`, [tokens]);
  });
}
function startSessionRevocationSweep() {
  setInterval(() => {
    if (!sessionDbReady || tokenToJwt.size === 0) return;
    void queueSessionDbOp(async () => {
      const tokens = [...tokenToJwt.keys()];
      const { rows } = await pool.query(
        `SELECT t AS token FROM unnest($1::text[]) AS t
         WHERE NOT EXISTS (SELECT 1 FROM companion_sessions cs WHERE cs.token = t)`,
        [tokens]
      );
      if (rows.length === 0) return;
      for (const r of rows) tokenToJwt.delete(r.token);
      console.log(`[Sessions] Evicted ${rows.length} revoked session(s) from memory`);
      try {
        const entries = [...tokenToJwt.entries()].map(([k, v]) => [k, slimSessionEntry(v)]);
        writeFileSync(join(DATA_DIR, "sessions.json"), JSON.stringify(entries), "utf-8");
      } catch {
      }
    });
  }, 6e4);
}
async function initSessionDb() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS companion_sessions (
         token TEXT PRIMARY KEY,
         entry JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await pool.query(`DELETE FROM companion_sessions WHERE updated_at < NOW() - INTERVAL '90 days'`);
    const { rows } = await pool.query(`SELECT token, entry FROM companion_sessions`);
    let restored = 0;
    for (const row of rows) {
      if (!tokenToJwt.has(row.token)) {
        tokenToJwt.set(row.token, row.entry);
        restored++;
      }
    }
    sessionDbReady = true;
    await syncSessionsToDb(tokenToJwt);
    startSessionRevocationSweep();
    console.log(`[Sessions] DB persistence ready (${rows.length} in DB, ${restored} restored to memory)`);
  } catch (e) {
    console.error("[Sessions] DB init failed (sessions won't survive restarts):", e?.message);
  }
}
void initSessionDb();
function allowedRolesForUser(baseRole) {
  if (!baseRole) return [];
  const compound = {
    driver_contractor: ["driver", "contractor"],
    driver_trucking_company: ["driver", "trucking_company"],
    trucking_company_contractor: ["trucking_company", "contractor"],
    driver_trucking_company_contractor: ["driver", "trucking_company", "contractor"]
  };
  return compound[baseRole] ?? [baseRole];
}
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
function userPayload(user, originalRole) {
  const { password, ...safe } = user || {};
  return addDualKeys({ ...safe, accountRole: originalRole || user?.role });
}
var USER_HYDRATE_EXCLUDE = /* @__PURE__ */ new Set(["password", "role"]);
async function hydrateUserFromDb(user) {
  if (!user?.id) return user;
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
    if (rows.length > 0) {
      for (const [k, v] of Object.entries(rows[0])) {
        if (USER_HYDRATE_EXCLUDE.has(k)) continue;
        if (v !== null && v !== void 0) user[k] = v;
      }
    }
  } catch (e) {
    console.log("hydrateUserFromDb error:", e?.message);
  }
  return user;
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
function billedMinutesFrom(actualMinutes) {
  if (actualMinutes <= 60) return 60;
  const overFirst = actualMinutes - 60;
  const fullSegments = Math.floor(overFirst / 15);
  const remainder = overFirst % 15;
  const billedSegments = remainder >= 5 ? fullSegments + 1 : fullSegments;
  return 60 + billedSegments * 15;
}
function haversineMilesFn(lat1, lng1, lat2, lng2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function segmentDistanceMilesFn(pLat, pLng, aLat, aLng, bLat, bLng) {
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
}
function closestPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const meanLatRad = (aLat + bLat) / 2 * Math.PI / 180;
  const mpdLat = 69;
  const mpdLng = 69 * Math.cos(meanLatRad);
  const ax = aLng * mpdLng, ay = aLat * mpdLat;
  const bx = bLng * mpdLng, by = bLat * mpdLat;
  const px = pLng * mpdLng, py = pLat * mpdLat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { lat: aLat, lng: aLng };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { lat: (ay + t * dy) / mpdLat, lng: (ax + t * dx) / mpdLng };
}
var roadMilesCache = /* @__PURE__ */ new Map();
var ROAD_CACHE_MAX = 2e3;
async function getRoadMiles(fromLat, fromLng, toLat, toLng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const key = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  if (roadMilesCache.has(key)) return roadMilesCache.get(key) ?? null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${fromLat},${fromLng}`);
    url.searchParams.set("destination", `${toLat},${toLng}`);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString());
    const data = await response.json();
    let miles = null;
    if (data.routes && data.routes.length > 0 && data.routes[0].legs?.[0]?.distance?.value != null) {
      miles = data.routes[0].legs[0].distance.value / 1609.34;
    } else if (data.status === "ZERO_RESULTS") {
      miles = null;
    } else {
      return null;
    }
    if (roadMilesCache.size >= ROAD_CACHE_MAX) {
      const firstKey = roadMilesCache.keys().next().value;
      if (firstKey !== void 0) roadMilesCache.delete(firstKey);
    }
    roadMilesCache.set(key, miles);
    return miles;
  } catch (e) {
    return null;
  }
}
async function roadMilesToJobArea(pLat, pLng, oLat, oLng, dLat, dLng) {
  const targets = [];
  if (oLat != null && oLng != null) targets.push({ lat: oLat, lng: oLng });
  if (dLat != null && dLng != null) targets.push({ lat: dLat, lng: dLng });
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    const mid = closestPointOnSegment(pLat, pLng, oLat, oLng, dLat, dLng);
    if (haversineMilesFn(mid.lat, mid.lng, oLat, oLng) > 0.5 && haversineMilesFn(mid.lat, mid.lng, dLat, dLng) > 0.5) {
      targets.push(mid);
    }
  }
  if (targets.length === 0) return null;
  const results = await Promise.all(targets.map((t) => getRoadMiles(pLat, pLng, t.lat, t.lng)));
  const valid = results.filter((m) => m != null);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}
var COMPANION_ONLY_JOB_KEYS = /* @__PURE__ */ new Set([
  "haulBothWays",
  "haul_both_ways",
  "returnMaterial",
  "return_material",
  "returnAmount",
  "return_amount",
  "returnAmountUnit",
  "return_amount_unit",
  "returnOriginAddress",
  "return_origin_address",
  "returnOriginLat",
  "return_origin_lat",
  "returnOriginLng",
  "return_origin_lng",
  "returnDestinationAddress",
  "return_destination_address",
  "returnDestinationLat",
  "return_destination_lat",
  "returnDestinationLng",
  "return_destination_lng"
]);
function airMilesToLeg(pLat, pLng, oLat, oLng, dLat, dLng) {
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    return segmentDistanceMilesFn(pLat, pLng, oLat, oLng, dLat, dLng);
  }
  if (oLat != null && oLng != null) return haversineMilesFn(pLat, pLng, oLat, oLng);
  if (dLat != null && dLng != null) return haversineMilesFn(pLat, pLng, dLat, dLng);
  return null;
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
  const loginFailures = /* @__PURE__ */ new Map();
  const LOGIN_FAILURE_LIMIT = 10;
  const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1e3;
  function loginThrottleKey(req, email) {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    return `${String(email).toLowerCase()}|${ip}`;
  }
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      const throttleKey = loginThrottleKey(req, email);
      const now = Date.now();
      const fail = loginFailures.get(throttleKey);
      if (fail && now - fail.windowStart < LOGIN_FAILURE_WINDOW_MS && fail.count >= LOGIN_FAILURE_LIMIT) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
      res.on("finish", () => {
        if (res.statusCode === 401) {
          const cur = loginFailures.get(throttleKey);
          if (!cur || now - cur.windowStart >= LOGIN_FAILURE_WINDOW_MS) {
            loginFailures.set(throttleKey, { count: 1, windowStart: now });
          } else {
            cur.count += 1;
          }
          if (loginFailures.size > 5e3) loginFailures.clear();
        } else if (res.statusCode < 400) {
          loginFailures.delete(throttleKey);
        }
      });
      if (process.env.NODE_ENV !== "production") {
        try {
          const localRes = await pool.query(
            `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
            [email]
          );
          const dbUser = localRes.rows[0];
          if (dbUser?.password && await bcrypt.compare(password, dbUser.password)) {
            const { password: _pw, ...safeDbUser } = dbUser;
            const localToken2 = crypto.randomBytes(32).toString("hex");
            const authEntry2 = {
              jwt: `dev-local:${dbUser.id}`,
              userId: dbUser.id,
              user: safeDbUser,
              originalRole: dbUser.role
            };
            tokenToJwt.set(localToken2, authEntry2);
            saveJsonMap("sessions.json", tokenToJwt);
            return res.json({ token: localToken2, user: userPayload(safeDbUser, authEntry2.originalRole) });
          }
        } catch (devErr) {
          console.error("Dev local login failed, falling back to website:", devErr.message);
        }
      }
      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email, password }
      });
      let data = await websiteRes.json();
      if (!websiteRes.ok) {
        let recovered = false;
        const upstreamMsg = String(data?.message || data?.error || "");
        const isCredentialRefusal401 = websiteRes.status === 401 && (/sign in with replit/i.test(upstreamMsg) || /invalid credentials/i.test(upstreamMsg));
        if (isCredentialRefusal401) try {
          const localRes = await pool.query(
            `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
            [email]
          );
          const dbUser = localRes.rows[0];
          if (dbUser?.password && await bcrypt.compare(password, dbUser.password)) {
            const retryRes = await websiteFetch("/api/companion/auth/login", {
              method: "POST",
              body: { email }
            });
            if (retryRes.ok) {
              data = await retryRes.json();
              recovered = true;
              console.log(`[Login] Local password verification fallback used for ${email}`);
            } else if (dbUser.login_provider === "replit_auth" && !dbUser.is_suspended) {
              const { password: _pw2, ...safeDbUser } = dbUser;
              const localToken2 = crypto.randomBytes(32).toString("hex");
              const authEntry2 = {
                jwt: `dev-local:${dbUser.id}`,
                userId: dbUser.id,
                user: safeDbUser,
                originalRole: dbUser.role
              };
              tokenToJwt.set(localToken2, authEntry2);
              saveJsonMap("sessions.json", tokenToJwt);
              console.log(`[Login] Companion-local session minted for ${email} (website refused email-only login)`);
              return res.json({ token: localToken2, user: userPayload(safeDbUser, authEntry2.originalRole) });
            }
          }
        } catch (fbErr) {
          console.error("[Login] Local password fallback failed:", fbErr.message);
        }
        if (!recovered) {
          return res.status(websiteRes.status).json({
            message: data.message || data.error || "Invalid credentials"
          });
        }
      }
      const jwt = data.token;
      const user = data.user;
      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }
      await hydrateUserFromDb(user);
      try {
        const roleRes = await pool.query(`SELECT role FROM users WHERE id = $1`, [user.id]);
        const dbRole = roleRes.rows[0]?.role;
        if (dbRole && dbRole !== user.role) {
          console.log(`[Login] Using DB role '${dbRole}' over website-reported '${user.role}' for ${email}`);
          user.role = dbRole;
          const isCompoundRole = allowedRolesForUser(String(dbRole)).length > 1;
          if (isCompoundRole) {
            console.log(`[RoleSync] Skipping upstream push of compound role '${dbRole}' at login for ${email}`);
          } else {
            try {
              const ur = await Promise.race([
                websiteFetch(`/api/users/${user.id}`, {
                  method: "PUT",
                  body: { role: dbRole },
                  jwt
                }),
                new Promise(
                  (_, reject) => setTimeout(() => reject(new Error("timed out after 5000ms")), 5e3)
                )
              ]);
              if (ur.ok) {
                console.log(`[RoleSync] Healed login role drift: pushed '${dbRole}' to website for ${email}`);
              } else {
                console.error(`[RoleSync] Failed to push role '${dbRole}' to website at login for ${email}: ${ur.status}`);
              }
            } catch (e) {
              console.error(`[RoleSync] Error pushing role to website at login:`, e.message);
            }
          }
        }
      } catch {
      }
      const localToken = crypto.randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user, originalRole: user.role };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);
      const enrichedUser = userPayload(user, authEntry.originalRole);
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
        const authEntry = { jwt, userId: user.id, user, originalRole: user.role };
        tokenToJwt.set(localToken, authEntry);
        saveJsonMap("sessions.json", tokenToJwt);
        return res.json({ token: localToken, user: userPayload(user, authEntry.originalRole) });
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
      const token = authHeader.slice(7);
      tokenToJwt.delete(token);
      saveJsonMap("sessions.json", tokenToJwt);
      deleteSessionsFromDb([token]);
    }
    return res.json({ ok: true });
  });
  app2.get("/api/auth/me", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    await hydrateUserFromDb(auth.user);
    return res.json({ user: userPayload(auth.user, auth.originalRole) });
  });
  app2.delete("/api/account", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const userId = auth.userId;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ownedJobs = `SELECT id FROM jobs WHERE contractor_id = $1`;
      const relevantRuns = `SELECT id FROM job_runs WHERE driver_id = $1 OR job_id IN (${ownedJobs})`;
      await client.query(
        `DELETE FROM weight_tickets WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM driver_location_updates WHERE driver_id = $1 OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM still_working_checks WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_photos WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM scheduled_notifications WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_bids WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_stops WHERE added_by_user_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_messages WHERE sender_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM reviews WHERE reviewer_id = $1 OR reviewee_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM conversation_actions WHERE user_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_runs WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_assignments WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM truck_availability WHERE trucking_company_id = $1 OR truck_id IN (SELECT id FROM trucks WHERE trucking_company_id = $1)`,
        [userId]
      );
      await client.query(
        `DELETE FROM driver_invitations WHERE contractor_id = $1 OR driver_id = $1 OR trucking_company_id = $1 OR assigned_truck_id IN (SELECT id FROM trucks WHERE trucking_company_id = $1)`,
        [userId]
      );
      await client.query(`DELETE FROM trucks WHERE trucking_company_id = $1`, [userId]);
      await client.query(`UPDATE trucks SET assigned_driver_id = NULL WHERE assigned_driver_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_vehicles WHERE driver_id = $1`, [userId]);
      await client.query(`UPDATE driver_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = $1`, [userId]);
      await client.query(`DELETE FROM jobs WHERE contractor_id = $1`, [userId]);
      await client.query(`UPDATE jobs SET driver_id = NULL WHERE driver_id = $1`, [userId]);
      await client.query(
        `DELETE FROM document_shares WHERE contractor_id = $1 OR document_id IN (SELECT id FROM driver_documents WHERE driver_id = $1)`,
        [userId]
      );
      await client.query(`DELETE FROM driver_documents WHERE driver_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_materials WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_projects WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_favorites WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_availability WHERE driver_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_favorites WHERE driver_id = $1 OR favoriter_id = $1`, [userId]);
      await client.query(`DELETE FROM company_favorites WHERE driver_id = $1 OR company_id = $1`, [userId]);
      await client.query(`DELETE FROM foreman_requests WHERE foreman_id = $1 OR target_company_id = $1`, [userId]);
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM sync_metadata WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM sync_queue WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE users SET trucking_company_id = NULL WHERE trucking_company_id = $1`, [userId]);
      const del = await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      if (del.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Account not found" });
      }
      await client.query("COMMIT");
      const removedTokens = [];
      for (const [token, session2] of tokenToJwt.entries()) {
        if (session2.userId === userId) {
          tokenToJwt.delete(token);
          removedTokens.push(token);
        }
      }
      if (removedTokens.length) {
        saveJsonMap("sessions.json", tokenToJwt);
        deleteSessionsFromDb(removedTokens);
      }
      void queueSessionDbOp(async () => {
        await pool.query(`DELETE FROM companion_sessions WHERE entry->>'userId' = $1`, [userId]);
      });
      return res.json({ ok: true });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      console.error("Account deletion error:", err.message);
      return res.status(500).json({ message: "Failed to delete account. Please try again." });
    } finally {
      client.release();
    }
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
      const { token, expoPushToken, expo_push_token, deviceToken, device_token } = req.body;
      const pushToken = token || expoPushToken || expo_push_token;
      if (pushToken) {
        await pool.query(`UPDATE users SET expo_push_token = $1 WHERE id = $2`, [pushToken, auth.userId]);
      }
      const apnsToken = deviceToken || device_token;
      const updateId = req.body.updateId || req.body.update_id || null;
      if (apnsToken && typeof apnsToken === "string" && /^[0-9a-fA-F]{32,200}$/.test(apnsToken)) {
        await pool.query(`UPDATE users SET apns_device_token = $1 WHERE id = $2`, [apnsToken, auth.userId]);
        console.log(`[PushRegister] user=${auth.userId} apnsToken=SAVED len=${apnsToken.length} update=${updateId}`);
      } else {
        console.log(`[PushRegister] user=${auth.userId} apnsToken=${apnsToken ? `REJECTED(len=${String(apnsToken).length})` : "MISSING"} update=${updateId} tokenError=${req.body.deviceTokenError || "none"}`);
      }
    } catch (e) {
      console.log(`[PushRegister] error: ${e}`);
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
      let query = `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text WHERE j.archived_at IS NULL`;
      const params = [];
      let paramIdx = 1;
      const visFeats = await getVisibilityFeatures(pool);
      if (visFeats.jobsVisibility) {
        query += jobVisibilityPredicate(visFeats, paramIdx);
        params.push(auth.userId);
        paramIdx++;
      }
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
      const projectIdFilter = req.query.project_id;
      if (projectIdFilter) {
        query += ` AND j.project_id = $${paramIdx}`;
        params.push(projectIdFilter);
        paramIdx++;
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      const truckType = req.query.truck_type;
      if (truckType) {
        query += ` AND j.truck_type::text = $${paramIdx}`;
        params.push(truckType);
        paramIdx++;
      }
      query += ` AND NOT (
        j.status::text IN ('open', 'accepted', 'pending')
        AND (
          ((SELECT COUNT(*) FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.status::text = 'approved')
          >= COALESCE(j.trucks_needed, 1)
          -- Never hide the caller's OWN postings (project view relies on this)
          AND j.contractor_id::text != $${paramIdx})
          OR (
            j.contractor_id::text != $${paramIdx}
            AND (
              EXISTS (
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
          )
        )
      )`;
      params.push(auth.userId);
      paramIdx++;
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;
      const result = await pool.query(query, params);
      const rows = result.rows.map(addDualKeys);
      try {
        const pend = await pool.query(
          `SELECT ja.id, ja.job_id, ja.sent_at
           FROM job_assignments ja
           JOIN jobs bj ON bj.id = ja.job_id
           JOIN users bu ON bu.id::text = bj.contractor_id::text AND bu.role::text = 'broker'
           WHERE ja.driver_id::text = $1
             AND ja.status::text = 'pending'
             AND ja.sent_at IS NOT NULL`,
          [auth.userId]
        );
        if (pend.rows.length > 0) {
          const byJob = new Map(pend.rows.map((r) => [String(r.job_id), r]));
          for (const row of rows) {
            const m = byJob.get(String(row.id));
            if (m) {
              row.needsConfirmation = true;
              row.needs_confirmation = true;
              row.assignmentId = m.id;
              row.assignment_id = m.id;
              row.assignmentSentAt = m.sent_at;
              row.assignment_sent_at = m.sent_at;
            }
          }
        }
      } catch (e) {
        console.error("GET /api/jobs broker-confirm annotate error:", e.message);
      }
      return res.json(rows);
    } catch (e) {
      console.error("GET /api/jobs local error:", e.message);
      return res.json([]);
    }
  });
  app2.get("/api/jobs/archived", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
  app2.post("/api/jobs/:id/visibility", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const vis = String(req.body?.visibility || "");
      if (vis !== "public" && vis !== "private") {
        return res.status(400).json({ message: "visibility must be 'public' or 'private'" });
      }
      const client = await pool.connect();
      let upd;
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL app.allow_visibility_change = '1'");
        upd = await client.query(
          `UPDATE jobs SET visibility = $1, updated_at = NOW()
           WHERE id = $2 AND contractor_id::text = $3
             AND EXISTS (SELECT 1 FROM users u WHERE u.id::text = $3::text AND u.role::text = 'broker')
           RETURNING id, visibility`,
          [vis, req.params.id, auth.userId]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw err;
      } finally {
        client.release();
      }
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true, visibility: upd.rows[0].visibility });
    } catch (e) {
      console.error("Job visibility error:", e.message);
      return res.status(500).json({ message: "Failed to update job visibility" });
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
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name,
                u.company as contractor_company,
                u.full_name as contractor_full_name,
                u.phone as contractor_phone,
                u.email as contractor_email,
                d.full_name as driver_name,
                COALESCE(NULLIF(dtc.company, ''), NULLIF(d.company, '')) as driver_company
         FROM jobs j
         LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
         LEFT JOIN users u ON j.contractor_id::text = u.id::text
         LEFT JOIN users d ON j.driver_id::text = d.id::text
         LEFT JOIN users dtc ON d.trucking_company_id::text = dtc.id::text
         WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
        const isParticipant = String(job.contractor_id) === auth.userId || String(job.driver_id) === auth.userId;
        let hasAssignment = false;
        if (!isParticipant) {
          const aCheck = await pool.query(
            `SELECT 1 FROM job_assignments ja WHERE ja.job_id = $1 AND ja.driver_id = $2
             AND ja.status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired')
             AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users _bu WHERE _bu.id::text = $3 AND _bu.role::text = 'broker'))
             LIMIT 1`,
            [req.params.id, auth.userId, String(job.contractor_id)]
          );
          hasAssignment = aCheck.rows.length > 0;
        }
        const canSeeDetails = isParticipant || hasAssignment;
        const visFeats = await getVisibilityFeatures(pool);
        const allowedPrivate = await canViewPrivateJob(
          pool,
          visFeats,
          job,
          auth.userId,
          canSeeDetails
        );
        if (!allowedPrivate) {
          return res.status(403).json({ message: "This project is private." });
        }
        if (canSeeDetails) {
          const assignResult = await pool.query(
            `SELECT ja.*, t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                    t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                    t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp,
                    du.full_name as driver_full_name,
                    COALESCE(NULLIF(dutc.company, ''), NULLIF(du.company, '')) as driver_company
             FROM job_assignments ja
             LEFT JOIN trucks t ON ja.vehicle_id = t.id
             LEFT JOIN users du ON ja.driver_id::text = du.id::text
             LEFT JOIN users dutc ON du.trucking_company_id::text = dutc.id::text
             WHERE ja.job_id = $1
             ORDER BY (ja.status::text = 'approved') DESC, ja.approved_at DESC NULLS LAST, ja.created_at DESC`,
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
          if (!job.driver_name || !job.driver_company) {
            const activeAssigns = assignResult.rows.filter(
              (r) => !["rejected", "withdrawn", "cancelled", "expired"].includes(String(r.status))
            );
            const primary = activeAssigns.find((r) => String(r.status) === "approved") || activeAssigns[0] || null;
            if (primary) {
              if (!job.driver_name) job.driver_name = primary.driver_full_name || null;
              if (!job.driver_company) job.driver_company = primary.driver_company || null;
            }
          }
        } else {
          job.assignments = [];
          job.jobRuns = [];
          job.job_runs = [];
          job.runs = [];
          job.weightTickets = [];
          job.weight_tickets = [];
          delete job.contractor_full_name;
          delete job.contractor_phone;
          delete job.contractor_email;
        }
        try {
          const brokerCheck = await pool.query(
            `SELECT 1 FROM users WHERE id::text = $1 AND role::text = 'broker' LIMIT 1`,
            [String(job.contractor_id)]
          );
          if (brokerCheck.rows.length > 0) {
            if (String(job.contractor_id) !== auth.userId && Array.isArray(job.assignments)) {
              job.assignments = job.assignments.filter((a) => a.sent_at || a.sentAt);
            }
            const mine = await pool.query(
              `SELECT id, sent_at FROM job_assignments
               WHERE job_id = $1 AND driver_id::text = $2
                 AND status::text = 'pending' AND sent_at IS NOT NULL LIMIT 1`,
              [req.params.id, auth.userId]
            );
            if (mine.rows.length > 0) {
              job.needsConfirmation = true;
              job.needs_confirmation = true;
              job.assignmentId = mine.rows[0].id;
              job.assignment_id = mine.rows[0].id;
              job.assignmentSentAt = mine.rows[0].sent_at;
              job.assignment_sent_at = mine.rows[0].sent_at;
            }
          }
        } catch (e) {
          console.error("GET /api/jobs/:id broker annotate error:", e.message);
        }
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
      const posterRole = String(auth.originalRole || auth.user?.role || "");
      if (posterRole === "broker") {
        if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
          return res.status(400).json({ message: "Broker job posting requires a live website account." });
        }
        const r = await websiteFetch("/api/jobs", { method: "POST", body: req.body, jwt: auth.jwt });
        const text2 = await r.text();
        let data;
        try {
          data = JSON.parse(text2);
        } catch {
          data = { message: text2 };
        }
        if (r.ok && data?.id) {
          try {
            await pool.query(`UPDATE jobs SET visibility = 'private' WHERE id = $1 AND visibility IS NULL`, [String(data.id)]);
          } catch {
          }
        }
        if (r.ok && data?.id && (req.body.clientName || req.body.clientEmail)) {
          try {
            const cName = String(req.body.clientName || "").trim();
            const cEmail = String(req.body.clientEmail || "").trim().toLowerCase();
            let clientKey = "";
            const m = await pool.query(
              `SELECT id FROM broker_manual_clients WHERE broker_id = $1
                 AND (($2 <> '' AND lower(name) = lower($2)) OR ($3 <> '' AND lower(email) = $3))
               LIMIT 1`,
              [auth.userId, cName, cEmail]
            );
            if (m.rows[0]) clientKey = `manual-${m.rows[0].id}`;
            await pool.query(
              `INSERT INTO broker_job_clients (job_id, broker_id, client_key, client_name, client_email)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (job_id) DO UPDATE SET client_key = $3, client_name = $4, client_email = $5`,
              [String(data.id), auth.userId, clientKey, cName, cEmail]
            );
          } catch (e) {
            console.error("[JobClientLink] save failed:", e.message);
          }
        }
        return res.status(r.status).json(addDualKeys(data));
      }
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
        "estimated_trips",
        "haul_both_ways",
        "return_material",
        "return_amount",
        "return_amount_unit",
        "return_origin_address",
        "return_origin_lat",
        "return_origin_lng",
        "return_destination_address",
        "return_destination_lat",
        "return_destination_lng"
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
      for (const k of Object.keys(pushBody)) {
        if (COMPANION_ONLY_JOB_KEYS.has(k)) delete pushBody[k];
      }
      console.log(`POST /api/jobs pushing to website with projectId=${pushBody.projectId || pushBody.project_id || "none"}, id=${id}`);
      pushToWebsite("/api/jobs", auth, { method: "POST", body: pushBody }).catch(() => {
      });
      const notifyId = String(job.id || id);
      markJobNotified(notifyId);
      try {
        if (await claimJobNotification(notifyId)) {
          await notifyNearbyDriversOfNewJob(job);
        }
      } catch (e) {
        console.error("POST /api/jobs notify error:", e.message);
      }
      return res.status(201).json(addDualKeys(job));
    } catch (e) {
      console.error("POST /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });
  async function proxyToWebsite(req, res) {
    const auth = getWebsiteAuth(req);
    if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
      return res.status(400).json({ message: "This feature requires a live website account." });
    }
    try {
      const r = await websiteFetch(req.originalUrl, {
        method: req.method,
        body: req.method === "GET" || req.method === "HEAD" ? void 0 : req.body ?? {},
        jwt: auth.jwt
      });
      const text2 = await r.text();
      let data;
      try {
        data = JSON.parse(text2);
      } catch {
        data = { message: text2 };
      }
      return res.status(r.status).json(addDualKeys(data));
    } catch (e) {
      console.error(`[WebsiteProxy] ${req.method} ${req.originalUrl} error:`, e.message);
      return res.status(502).json({ message: "Website request failed" });
    }
  }
  async function requireBrokerRole(req, res, next) {
    try {
      const auth = getWebsiteAuth(req);
      const r = await pool.query(
        `SELECT 1 FROM users WHERE id::text = $1 AND role::text = 'broker' LIMIT 1`,
        [auth.userId]
      );
      if (!r.rows[0]) return res.status(403).json({ message: "Broker access required" });
      next();
    } catch (e) {
      console.error("requireBrokerRole error:", e.message);
      return res.status(500).json({ message: "Authorization check failed" });
    }
  }
  app2.get("/api/broker/clients", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    try {
      let upstream = [];
      if (auth.jwt && !auth.jwt.startsWith("dev-local:")) {
        const cr = await websiteFetch("/api/broker/clients", { method: "GET", jwt: auth.jwt });
        if (cr.ok) {
          const data = await cr.json().catch(() => []);
          if (Array.isArray(data)) upstream = data;
        }
      }
      const local = await pool.query(
        `SELECT * FROM broker_manual_clients WHERE broker_id = $1 ORDER BY created_at DESC`,
        [auth.userId]
      );
      const countMap = /* @__PURE__ */ new Map();
      try {
        const counts = await pool.query(
          `SELECT l.client_key, COUNT(*)::int AS n
             FROM broker_job_clients l
             JOIN jobs j ON j.id::text = l.job_id
            WHERE l.broker_id = $1 AND l.client_key <> ''
              AND j.archived_at IS NULL
              AND j.status::text NOT IN ('cancelled', 'completed')
            GROUP BY l.client_key`,
          [auth.userId]
        );
        for (const row of counts.rows) countMap.set(String(row.client_key), Number(row.n));
      } catch (e) {
        console.error("[BrokerClients] job counts failed:", e.message);
      }
      const manual = local.rows.map((r) => {
        const key = `manual-${r.id}`;
        const n = countMap.get(key) || 0;
        return {
          clientUserId: key,
          client_user_id: key,
          name: r.name,
          email: r.email || "",
          phone: r.phone || "",
          contactName: r.contact_name || "",
          contact_name: r.contact_name || "",
          address: r.address || "",
          notes: r.notes || "",
          status: "active",
          isManual: true,
          is_manual: true,
          activeJobs: n,
          activeJobsCount: n,
          active_jobs_count: n
        };
      });
      const manualKeys = new Set(manual.map((m) => m.clientUserId));
      const upstreamWithCounts = upstream.filter((c) => !manualKeys.has(String(c.clientUserId || c.client_user_id || ""))).map((c) => {
        const key = String(c.clientUserId || c.client_user_id || "");
        const n = countMap.get(key);
        return n === void 0 ? c : { ...c, activeJobsCount: n, active_jobs_count: n };
      });
      return res.json([...manual, ...upstreamWithCounts]);
    } catch (e) {
      console.error("GET /api/broker/clients error:", e.message);
      return res.status(500).json({ message: "Failed to load clients" });
    }
  });
  app2.get("/api/broker/jobs", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    try {
      if (!auth.jwt || auth.jwt.startsWith("dev-local:")) return res.json([]);
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const jr = await websiteFetch(`/api/broker/jobs${qs}`, { method: "GET", jwt: auth.jwt });
      if (!jr.ok) {
        const text2 = await jr.text();
        let data;
        try {
          data = JSON.parse(text2);
        } catch {
          data = { message: text2 };
        }
        return res.status(jr.status).json(data);
      }
      const jobs2 = await jr.json().catch(() => []);
      if (!Array.isArray(jobs2)) return res.json(addDualKeys(jobs2));
      const links = await pool.query(
        `SELECT job_id, client_key, client_name, client_email FROM broker_job_clients WHERE broker_id = $1`,
        [auth.userId]
      );
      const linkMap = new Map(links.rows.map((l) => [String(l.job_id), l]));
      const projRows = await pool.query(
        `SELECT j.id, j.project_id, COALESCE(cp.name, bp.name) AS project_name
         FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id::text = j.project_id::text
         LEFT JOIN broker_client_projects bp ON bp.id::text = j.project_id::text
         WHERE j.contractor_id = $1 AND j.project_id IS NOT NULL`,
        [auth.userId]
      );
      const projMap = new Map(projRows.rows.map((r) => [String(r.id), r]));
      const assignRows = await pool.query(
        `SELECT ja.id, ja.job_id, ja.driver_id, ja.status, ja.sent_at
           FROM job_assignments ja
           JOIN jobs j ON j.id = ja.job_id
          WHERE j.contractor_id = $1`,
        [auth.userId]
      );
      const assignMap = /* @__PURE__ */ new Map();
      for (const a of assignRows.rows) {
        const key = String(a.job_id);
        if (!assignMap.has(key)) assignMap.set(key, []);
        assignMap.get(key).push({
          id: a.id,
          driverId: String(a.driver_id),
          driver_id: String(a.driver_id),
          status: a.status,
          sentAt: a.sent_at,
          sent_at: a.sent_at
        });
      }
      for (const j of jobs2) {
        const jid = String(j.id || "");
        const cKey = String(j.clientUserId || j.client_user_id || "");
        const cName = String(j.clientName || j.client_name || "").trim();
        const cEmail = String(j.clientEmail || j.client_email || "").trim().toLowerCase();
        if (!jid || linkMap.has(jid) || !cKey && !cName && !cEmail) continue;
        try {
          await pool.query(
            `INSERT INTO broker_job_clients (job_id, broker_id, client_key, client_name, client_email)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (job_id) DO NOTHING`,
            [jid, auth.userId, cKey, cName, cEmail]
          );
          linkMap.set(jid, { job_id: jid, client_key: cKey, client_name: cName, client_email: cEmail });
        } catch (e) {
          console.error("[JobClientLink] backfill failed:", e.message);
        }
      }
      const merged = jobs2.map((j) => {
        const l = linkMap.get(String(j.id));
        const p = projMap.get(String(j.id));
        const localAssigns = assignMap.get(String(j.id));
        const needAssigns = !Array.isArray(j.assignments) || j.assignments.length === 0;
        if (!l && !p && !(needAssigns && localAssigns)) return j;
        return {
          ...j,
          ...needAssigns && localAssigns ? { assignments: localAssigns } : {},
          ...l ? {
            clientName: l.client_name || j.clientName,
            clientEmail: l.client_email || j.clientEmail,
            clientUserId: l.client_key || j.clientUserId
          } : {},
          ...p ? {
            projectId: j.projectId || p.project_id,
            projectName: j.projectName || p.project_name || void 0
          } : {}
        };
      });
      return res.json(addDualKeys(merged));
    } catch (e) {
      console.error("GET /api/broker/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to load jobs" });
    }
  });
  app2.get("/api/broker/roster", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    try {
      if (!auth.jwt || auth.jwt.startsWith("dev-local:")) return res.json([]);
      const fetchRoster = async () => {
        const rr = await websiteFetch("/api/broker/roster", { method: "GET", jwt: auth.jwt });
        if (!rr.ok) return null;
        const data = await rr.json().catch(() => null);
        return Array.isArray(data) ? data : null;
      };
      let roster = await fetchRoster();
      if (roster === null) return res.status(502).json({ message: "Failed to load roster" });
      const own = await pool.query(
        `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
         WHERE u.email IS NOT NULL AND (
           (u.id::text <> $1 AND u.trucking_company_id::text = $1)
           OR u.id::text IN (
             SELECT assigned_driver_id::text FROM trucks
             WHERE trucking_company_id::text = $1 AND assigned_driver_id IS NOT NULL AND archived_at IS NULL
           )
         )`,
        [String(auth.userId)]
      );
      const rosterIds = new Set(roster.map((r) => String(r.driverId || r.driver_id || "")).filter(Boolean));
      const rosterEmails = new Set(
        roster.map((r) => String(r.driverEmail || r.driver_email || r.email || "").toLowerCase()).filter(Boolean)
      );
      let invitedAny = false;
      let invitedSelf = false;
      for (const u of own.rows) {
        const email = String(u.email || "").toLowerCase();
        if (!email || rosterIds.has(String(u.id)) || rosterEmails.has(email)) continue;
        try {
          const ir = await websiteFetch("/api/broker/roster/invite", {
            method: "POST",
            body: { email: u.email, name: u.full_name || u.email },
            jwt: auth.jwt
          });
          if (ir.ok) {
            invitedAny = true;
            if (String(u.id) === String(auth.userId)) invitedSelf = true;
          } else console.error(`[RosterAutoInvite] invite for ${u.id} failed: ${ir.status}`);
        } catch (e) {
          console.error("[RosterAutoInvite] error:", e.message);
        }
      }
      const selfPending = roster.some(
        (r) => String(r.driverId || r.driver_id || "") === String(auth.userId) && String(r.status || "").toLowerCase() === "pending"
      );
      if (invitedSelf || selfPending) {
        try {
          const pr = await websiteFetch("/api/invitations/pending", { method: "GET", jwt: auth.jwt });
          const pending = pr.ok ? await pr.json().catch(() => []) : [];
          for (const inv of Array.isArray(pending) ? pending : []) {
            const inviter = String(inv.brokerId || inv.broker_id || inv.inviterId || inv.inviter_id || inv.invitedBy || inv.invited_by || "");
            if (inviter !== String(auth.userId)) continue;
            try {
              const ar = await websiteFetch(`/api/invitations/${inv.id}/accept`, { method: "POST", jwt: auth.jwt });
              if (ar.ok) invitedAny = true;
              else console.error(`[RosterAutoInvite] self-accept ${inv.id} failed: ${ar.status}`);
            } catch (e) {
              console.error("[RosterAutoInvite] self-accept error:", e.message);
            }
          }
        } catch (e) {
          console.error("[RosterAutoInvite] self-accept fetch error:", e.message);
        }
      }
      if (invitedAny) roster = await fetchRoster() || roster;
      try {
        const driverIds = roster.map((r) => String(r.driverId || r.driver_id || "")).filter(Boolean);
        if (driverIds.length > 0) {
          const du = await pool.query(
            `SELECT id::text AS id, full_name, company, COALESCE(trucking_company_id::text, id::text) AS company_key
               FROM users WHERE id::text = ANY($1)`,
            [driverIds]
          );
          const userMap = new Map(du.rows.map((u) => [u.id, u]));
          const brokerKey = String(auth.userId);
          const tr = await pool.query(
            `SELECT t.id, t.truck_number, t.year, t.make, t.model, t.truck_type, t.capacity,
                    t.license_plate, t.assigned_driver_id::text AS assigned_driver_id,
                    t.trucking_company_id::text AS trucking_company_id,
                    o.company AS owner_company, o.full_name AS owner_name
               FROM trucks t
               LEFT JOIN users o ON o.id::text = t.trucking_company_id::text
              WHERE t.archived_at IS NULL AND t.is_active = true
                AND (t.assigned_driver_id::text = ANY($1) OR t.trucking_company_id::text = $2)`,
            [driverIds, brokerKey]
          );
          roster = roster.map((r) => {
            const dId = String(r.driverId || r.driver_id || "");
            const u = userMap.get(dId);
            const pool_ = tr.rows.filter((t) => t.assigned_driver_id === dId);
            return {
              ...r,
              companyName: pool_[0]?.owner_company || u?.company || "",
              trucks: pool_.map((t) => ({
                id: t.id,
                truckNumber: t.truck_number,
                year: t.year,
                make: t.make,
                model: t.model,
                truckType: t.truck_type,
                capacity: t.capacity,
                licensePlate: t.license_plate
              }))
            };
          });
        }
      } catch (e) {
        console.error("[Roster] truck enrichment failed:", e.message);
      }
      return res.json(addDualKeys(roster));
    } catch (e) {
      console.error("GET /api/broker/roster error:", e.message);
      return res.status(500).json({ message: "Failed to load roster" });
    }
  });
  app2.get("/api/broker/roster-availability", requireAuth, requireBrokerRole, async (req, res) => {
    const date = String(req.query.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date=YYYY-MM-DD required" });
    }
    try {
      const auth = getWebsiteAuth(req);
      let driverIds = [];
      if (auth.jwt && !auth.jwt.startsWith("dev-local:")) {
        const rr = await websiteFetch("/api/broker/roster", { method: "GET", jwt: auth.jwt });
        if (rr.ok) {
          const rosterData = await rr.json().catch(() => []);
          if (Array.isArray(rosterData)) {
            driverIds = rosterData.map((d) => String(d.driverId || d.driver_id || d.id || "")).filter(Boolean).slice(0, 200);
          }
        }
      }
      if (driverIds.length === 0) return res.json({});
      const result = await pool.query(
        `SELECT driver_id, is_available, notes
         FROM driver_availability
         WHERE date = $1 AND driver_id = ANY($2)`,
        [date, driverIds]
      );
      const map = {};
      for (const r of result.rows) {
        if (r.is_available === false) {
          map[String(r.driver_id)] = { unavailable: true, notes: r.notes || null };
        } else if (!map[String(r.driver_id)]) {
          map[String(r.driver_id)] = { unavailable: false, notes: null };
        }
      }
      try {
        const excludeJobId = String(req.query.excludeJobId || req.query.exclude_job_id || "");
        const params = [date, driverIds.map(String)];
        let excludeClause = "";
        if (excludeJobId) {
          params.push(excludeJobId);
          excludeClause = ` AND ja.job_id::text <> $3`;
        }
        const booked = await pool.query(
          `SELECT DISTINCT ja.driver_id, j.scheduled_date, j.estimated_days,
                  j.includes_weekends, j.includes_saturday, j.includes_sunday
             FROM job_assignments ja
             JOIN jobs j ON j.id = ja.job_id
            WHERE ja.driver_id::text = ANY($2)
              AND ja.status::text = 'approved'
              AND j.status::text NOT IN ('completed','cancelled','expired')
              AND $1::date >= j.scheduled_date::date
              AND $1::date <= (j.scheduled_date::date
                    + (GREATEST(CEIL(COALESCE(j.estimated_days,1)::numeric)::int, 1) * 3) * INTERVAL '1 day')::date${excludeClause}`,
          params
        );
        for (const r of booked.rows) {
          const key = String(r.driver_id);
          if (map[key]?.unavailable) continue;
          const workingDays = getJobDateRange(
            r.scheduled_date,
            Number(r.estimated_days) || 1,
            !!r.includes_weekends,
            r.includes_saturday !== false,
            r.includes_sunday !== false
          );
          if (workingDays.includes(date)) {
            map[key] = { unavailable: true, notes: null };
          }
        }
      } catch (e) {
        console.error("roster-availability booked-job check error:", e.message);
      }
      return res.json(map);
    } catch (e) {
      console.error("GET /api/broker/roster-availability error:", e.message);
      return res.status(500).json({ message: "Failed to load availability" });
    }
  });
  app2.get("/api/broker/scheduled-sends", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const date = String(req.query.date || "").slice(0, 10);
    try {
      const params = [auth.userId];
      let where = `broker_id = $1 AND (status = 'pending' OR (status IN ('sent', 'failed') AND send_at > NOW() - INTERVAL '7 days'))`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        where += ` AND date = $2`;
        params.push(date);
      }
      const r = await pool.query(
        `SELECT id, date, send_at, status, error, sent_jobs, created_at FROM broker_scheduled_sends WHERE ${where} ORDER BY send_at ASC`,
        params
      );
      return res.json(r.rows.map((row) => ({
        id: row.id,
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
        sendAt: row.send_at,
        status: row.status,
        error: row.error ?? null,
        sentJobs: row.sent_jobs ?? 0
      })));
    } catch (e) {
      console.error("GET /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to load scheduled sends" });
    }
  });
  app2.post("/api/broker/scheduled-sends", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (auth.jwt && auth.jwt.startsWith("dev-local:")) {
      return res.status(400).json({ message: "Scheduled sends require a LoadLink login" });
    }
    const date = String(req.body?.date || "").slice(0, 10);
    const sendAt = new Date(String(req.body?.sendAt || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (isNaN(sendAt.getTime())) return res.status(400).json({ message: "sendAt must be a valid timestamp" });
    if (sendAt.getTime() < Date.now() - 6e4) return res.status(400).json({ message: "sendAt is in the past" });
    try {
      await pool.query(
        `DELETE FROM broker_scheduled_sends WHERE broker_id = $1 AND date = $2 AND status IN ('pending', 'failed')`,
        [auth.userId, date]
      );
      const tzOffsetMin = Number(req.body?.tzOffsetMin ?? req.header("X-TZ-Offset") ?? 0) || 0;
      const r = await pool.query(
        `INSERT INTO broker_scheduled_sends (broker_id, date, send_at, tz_offset_min) VALUES ($1, $2, $3, $4)
         RETURNING id, date, send_at, status`,
        [auth.userId, date, sendAt.toISOString(), tzOffsetMin]
      );
      const row = r.rows[0];
      return res.status(201).json({
        id: row.id,
        date,
        sendAt: row.send_at,
        status: row.status
      });
    } catch (e) {
      console.error("POST /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to schedule send" });
    }
  });
  app2.delete("/api/broker/scheduled-sends/:id", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    try {
      const r = await pool.query(
        `DELETE FROM broker_scheduled_sends WHERE id = $1 AND broker_id = $2 AND status IN ('pending', 'failed') RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ message: "Scheduled send not found" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to cancel scheduled send" });
    }
  });
  app2.post("/api/broker/clients", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const contactName = String(req.body?.contactName || req.body?.contact_name || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!name) return res.status(400).json({ message: "Client name is required" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const dupe = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE broker_id = $1 AND lower(name) = lower($2)`,
        [auth.userId, name]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "You already have a client with that name" });
      const result = await pool.query(
        `INSERT INTO broker_manual_clients (broker_id, name, email, phone, contact_name, address, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [auth.userId, name, email || null, phone || null, contactName || null, address || null, notes || null]
      );
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST /api/broker/clients error:", e.message);
      return res.status(500).json({ message: "Failed to add client" });
    }
  });
  app2.put("/api/broker/clients/:id", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const rawId = String(req.params.id || "");
    if (!rawId.startsWith("manual-")) {
      return res.status(400).json({ message: "Only manually added clients can be edited" });
    }
    const id = rawId.slice(7);
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const contactName = String(req.body?.contactName || req.body?.contact_name || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!name) return res.status(400).json({ message: "Client name is required" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const dupe = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE broker_id = $1 AND lower(name) = lower($2) AND id::text <> $3`,
        [auth.userId, name, id]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "You already have a client with that name" });
      const result = await pool.query(
        `UPDATE broker_manual_clients SET name = $1, email = $2, phone = $3, contact_name = $4, address = $5, notes = $6
         WHERE id::text = $7 AND broker_id = $8 RETURNING *`,
        [name, email || null, phone || null, contactName || null, address || null, notes || null, id, auth.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Client not found" });
      return res.json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("PUT /api/broker/clients/:id error:", e.message);
      return res.status(500).json({ message: "Failed to update client" });
    }
  });
  app2.delete("/api/broker/clients/:id", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const rawId = String(req.params.id || "");
    if (!rawId.startsWith("manual-")) {
      return res.status(400).json({ message: "Only manually added clients can be removed" });
    }
    try {
      const result = await pool.query(
        `DELETE FROM broker_manual_clients WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
        [rawId.slice(7), auth.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Client not found" });
      return res.json({ success: true });
    } catch (e) {
      console.error("DELETE /api/broker/clients/:id error:", e.message);
      return res.status(500).json({ message: "Failed to remove client" });
    }
  });
  async function verifyBrokerClient(auth, clientUserId) {
    if (clientUserId.startsWith("manual-")) {
      const own = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE id::text = $1 AND broker_id = $2`,
        [clientUserId.slice(7), auth.userId]
      ).catch(() => ({ rows: [] }));
      return own.rows[0] ? null : { status: 403, message: "Not one of your clients" };
    }
    if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
      return { status: 400, message: "This feature requires a live website account." };
    }
    const cr = await websiteFetch("/api/broker/clients", { method: "GET", jwt: auth.jwt });
    if (!cr.ok) return { status: cr.status, message: "Could not verify client list" };
    const clients = await cr.json().catch(() => []);
    const isMyClient = Array.isArray(clients) && clients.some(
      (c) => String(c.clientUserId || c.client_user_id || "") === clientUserId
    );
    return isMyClient ? null : { status: 403, message: "Not one of your clients" };
  }
  app2.get("/api/broker/client-projects", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const clientUserId = String(req.query.clientUserId || "").trim();
    if (!clientUserId) return res.status(400).json({ message: "clientUserId is required" });
    try {
      const err = await verifyBrokerClient(auth, clientUserId);
      if (err) return res.status(err.status).json({ message: err.message });
      const brokerProjects = await pool.query(
        `SELECT * FROM broker_client_projects WHERE broker_id = $1 AND client_user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [auth.userId, clientUserId]
      );
      let clientOwn = [];
      if (!clientUserId.startsWith("manual-")) {
        const result = await pool.query(
          `SELECT * FROM contractor_projects WHERE contractor_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
          [clientUserId]
        );
        clientOwn = result.rows;
      }
      return res.json([
        ...brokerProjects.rows.map((r) => ({ ...r, is_broker_project: true, isBrokerProject: true })),
        ...clientOwn.map((r) => ({ ...r, is_broker_project: false, isBrokerProject: false }))
      ].map(addDualKeys));
    } catch (e) {
      console.error("GET /api/broker/client-projects error:", e.message);
      return res.status(500).json({ message: "Failed to load client projects" });
    }
  });
  app2.post("/api/broker/client-projects", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    const clientUserId = String(req.body?.clientUserId || req.body?.client_user_id || "").trim();
    const name = String(req.body?.name || "").trim();
    const jobNumber = String(req.body?.jobNumber || req.body?.job_number || "").trim();
    const siteAddress = String(req.body?.siteAddress || req.body?.site_address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const siteLat = req.body?.siteLat ?? req.body?.site_lat;
    const siteLng = req.body?.siteLng ?? req.body?.site_lng;
    const lat = siteLat != null && siteLat !== "" && isFinite(Number(siteLat)) ? Number(siteLat) : null;
    const lng = siteLng != null && siteLng !== "" && isFinite(Number(siteLng)) ? Number(siteLng) : null;
    if (!clientUserId) return res.status(400).json({ message: "clientUserId is required" });
    if (!name) return res.status(400).json({ message: "Project name is required" });
    try {
      const err = await verifyBrokerClient(auth, clientUserId);
      if (err) return res.status(err.status).json({ message: err.message });
      const dupe = await pool.query(
        `SELECT id FROM broker_client_projects WHERE broker_id = $1 AND client_user_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL`,
        [auth.userId, clientUserId, name]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "This client already has a project with that name" });
      const result = await pool.query(
        `INSERT INTO broker_client_projects (broker_id, client_user_id, name, job_number, site_address, site_lat, site_lng, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [auth.userId, clientUserId, name, jobNumber || null, siteAddress || null, lat, lng, notes || null]
      );
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("POST /api/broker/client-projects error:", e.message);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });
  app2.put("/api/broker/client-projects/:id", requireAuth, requireBrokerRole, async (req, res) => {
    const auth = getWebsiteAuth(req);
    try {
      const own = await pool.query(
        `SELECT * FROM broker_client_projects WHERE id::text = $1 AND broker_id = $2 AND deleted_at IS NULL`,
        [String(req.params.id), auth.userId]
      );
      if (!own.rows[0]) return res.status(404).json({ message: "Project not found" });
      const b = req.body || {};
      const name = b.name != null ? String(b.name).trim() : null;
      if (b.name != null && !name) return res.status(400).json({ message: "Project name cannot be empty" });
      const siteLatRaw = b.siteLat ?? b.site_lat;
      const siteLngRaw = b.siteLng ?? b.site_lng;
      const result = await pool.query(
        `UPDATE broker_client_projects SET
           name = COALESCE($3, name),
           job_number = COALESCE($4, job_number),
           site_address = COALESCE($5, site_address),
           site_lat = COALESCE($6, site_lat),
           site_lng = COALESCE($7, site_lng),
           notes = COALESCE($8, notes)
         WHERE id::text = $1 AND broker_id = $2 RETURNING *`,
        [
          String(req.params.id),
          auth.userId,
          name,
          b.jobNumber != null || b.job_number != null ? String(b.jobNumber ?? b.job_number).trim() : null,
          b.siteAddress != null || b.site_address != null ? String(b.siteAddress ?? b.site_address).trim() : null,
          siteLatRaw != null && siteLatRaw !== "" && isFinite(Number(siteLatRaw)) ? Number(siteLatRaw) : null,
          siteLngRaw != null && siteLngRaw !== "" && isFinite(Number(siteLngRaw)) ? Number(siteLngRaw) : null,
          b.notes != null ? String(b.notes).trim() : null
        ]
      );
      return res.json(addDualKeys(result.rows[0]));
    } catch (e) {
      console.error("PUT /api/broker/client-projects/:id error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });
  app2.all(/^\/api\/broker\/.*/, requireAuth, proxyToWebsite);
  const handleAssignmentResponse = (action) => async (req, res) => {
    const auth = getWebsiteAuth(req);
    const assignmentId = String(req.params.id);
    try {
      const up = await websiteFetch(`/api/assignments/${assignmentId}/${action}`, {
        method: "POST",
        body: req.body ?? {},
        jwt: auth.jwt
      });
      const text2 = await up.text();
      const isSelfAssignGate = up.status === 400 && /not a broker assignment/i.test(text2 || "");
      if (isSelfAssignGate) {
        let selfAssigned = false;
        try {
          const row = await pool.query(
            `SELECT ja.id FROM job_assignments ja
                 JOIN jobs j ON j.id = ja.job_id
                WHERE ja.id = $1
                  AND ja.driver_id::text = $2
                  AND j.contractor_id::text = $2
                  AND ja.sent_at IS NOT NULL`,
            [assignmentId, auth.userId]
          );
          selfAssigned = row.rows.length > 0;
        } catch {
          selfAssigned = false;
        }
        if (selfAssigned) {
          const target = action === "confirm" ? "approved" : "rejected";
          const upd = await pool.query(
            action === "confirm" ? `UPDATE job_assignments SET status = 'approved', approved_at = NOW()
                     WHERE id = $1 AND status::text = 'pending'` : `UPDATE job_assignments SET status = 'rejected'
                     WHERE id = $1 AND status::text = 'pending'`,
            [assignmentId]
          );
          let done = (upd.rowCount || 0) === 1;
          if (!done) {
            const cur = await pool.query(
              `SELECT status::text AS status FROM job_assignments WHERE id = $1`,
              [assignmentId]
            );
            done = cur.rows[0]?.status === target;
          }
          if (done) {
            return res.json({ ok: true, selfAssigned: true });
          }
        }
      }
      res.status(up.status);
      try {
        res.json(JSON.parse(text2));
      } catch {
        res.send(text2);
      }
      if (up.ok) {
        notifyBrokerAssignmentResponse(assignmentId, auth.userId, action).catch(
          (e) => console.error("Broker confirm-notify error:", e.message)
        );
      }
    } catch (e) {
      console.error(`POST /api/assignments/:id/${action} error:`, e.message);
      if (!res.headersSent) res.status(502).json({ message: "Failed to reach website" });
    }
  };
  app2.post("/api/assignments/:id/confirm", requireAuth, handleAssignmentResponse("confirm"));
  app2.post("/api/assignments/:id/decline", requireAuth, handleAssignmentResponse("decline"));
  app2.get("/api/invitations/pending", requireAuth, proxyToWebsite);
  app2.post("/api/invitations/:id/accept", requireAuth, proxyToWebsite);
  app2.put("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const beforeRow = await pool.query(`SELECT scheduled_date, material, contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!beforeRow.rows[0]) return res.status(404).json({ message: "Job not found" });
      if (String(beforeRow.rows[0].contractor_id) !== String(auth.userId)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const prevDate = beforeRow.rows[0]?.scheduled_date ? String(beforeRow.rows[0].scheduled_date).slice(0, 10) : null;
      const jobMaterial = beforeRow.rows[0]?.material || "";
      const jobContractorId = beforeRow.rows[0]?.contractor_id;
      if (!beforeRow.rows[0] || String(jobContractorId) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to update this job" });
      }
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
              await sendPushNotification(String(a.driver_id), notifTitle, notifBody, { jobId: req.params.id, type: "job_date_changed" }).catch(() => {
              });
            }
          }
        }
      }
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      if (updates.length > 0) {
        const updatedRow = result.rows[0] || {};
        const pushBody = {};
        for (const k of Object.keys(req.body)) {
          if (req.body[k] === void 0) continue;
          if (COMPANION_ONLY_JOB_KEYS.has(k)) continue;
          const col = camelToSnake2(k);
          let v = Object.prototype.hasOwnProperty.call(updatedRow, col) ? updatedRow[col] : req.body[k];
          if (v instanceof Date) {
            v = col === "scheduled_date" ? v.toISOString().slice(0, 10) : v.toISOString();
          }
          pushBody[snakeToCamel(k)] = v;
        }
        pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: pushBody }).catch(() => {
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
  async function privateJobApplicationBlock(jobId, userId) {
    try {
      const visFeats = await getVisibilityFeatures(pool);
      if (!visFeats.jobsVisibility) return null;
      const jr = await pool.query(
        `SELECT id, contractor_id, driver_id, project_id, visibility::text AS visibility${visFeats.publicPositionsRemaining ? ", public_positions_remaining" : ""}
         FROM jobs WHERE id = $1`,
        [jobId]
      );
      const job = jr.rows[0];
      if (!job) return null;
      let participant = String(job.contractor_id) === String(userId);
      if (!participant) {
        const aChk = await pool.query(
          `SELECT 1 FROM job_assignments ja WHERE ja.job_id = $1 AND ja.driver_id::text = $2
           AND ja.status::text NOT IN ('rejected','withdrawn','cancelled','expired')
           AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
             SELECT 1 FROM users _bu WHERE _bu.id::text = $3::text AND _bu.role::text = 'broker'))
           LIMIT 1`,
          [jobId, userId, String(job.contractor_id)]
        );
        participant = aChk.rows.length > 0;
      }
      const allowed = await canViewPrivateJob(pool, visFeats, job, userId, participant);
      return allowed ? null : "This job is private and not accepting public applications.";
    } catch (e) {
      console.error("privateJobApplicationBlock error:", e.message);
      return null;
    }
  }
  app2.post("/api/jobs/:id/accept", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const { vehicleIds } = req.body || {};
      const jobRow = await pool.query(
        `SELECT id, contractor_id, driver_id, project_id, COALESCE(trucks_needed, 1)::int AS trucks_needed FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const contractorId = jobRow.rows[0]?.contractor_id;
      const trucksNeeded = Number(jobRow.rows[0]?.trucks_needed) || 1;
      const privateBlock = await privateJobApplicationBlock(req.params.id, auth.userId);
      if (privateBlock) return res.status(403).json({ message: privateBlock });
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
      const callerIsFleet = isAutoApprove ? await isFleetAccount(auth.userId) : false;
      if (isAutoApprove) {
        const pendingRows = await pool.query(
          `SELECT vehicle_id FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending' AND vehicle_id IS NOT NULL`,
          [req.params.id, auth.userId]
        );
        const vidsToApprove = [
          ...Array.isArray(vehicleIds) ? vehicleIds : [],
          ...pendingRows.rows.map((r) => r.vehicle_id)
        ];
        const conflicts = await findApprovedTruckConflicts(vidsToApprove, String(req.params.id));
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
        if (!callerIsFleet) {
          const driverConflicts = await findApprovedDriverConflicts([auth.userId], String(req.params.id));
          if (driverConflicts.length > 0) {
            return res.status(409).json({ message: driverConflictMessage(driverConflicts, true), conflicts: driverConflicts });
          }
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
        const autoApproveUpdate = await pool.query(
          `UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
        await withdrawConflictingPendingApplications(String(req.params.id), Array.isArray(vehicleIds) ? vehicleIds : [], callerIsFleet ? [] : [auth.userId], auth);
        autoApproved = true;
        if ((autoApproveUpdate.rowCount || 0) > 0) {
          const jobRowForAward = await pool.query(`SELECT material FROM jobs WHERE id = $1`, [req.params.id]);
          await notifyDriverJobAwarded(String(auth.userId), String(req.params.id), jobRowForAward.rows[0]?.material).catch(() => {
          });
        }
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
        try {
          await pool.query(
            `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
             VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
            [crypto.randomUUID(), contractorId, notifTitle, notifBody, req.params.id]
          );
        } catch (e) {
          console.error("Job-application notification insert error:", e.message);
        }
        await sendPushNotification(contractorId, notifTitle, notifBody, { jobId: req.params.id, type: "job_application" }).catch(() => {
        });
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
        `SELECT ja.*, j.scheduled_date, j.estimated_days, j.material as job_material,
                j.includes_weekends, j.includes_saturday, j.includes_sunday FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.vehicle_id IS NOT NULL AND ja.job_id != $1
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')
         AND ja.status::text = 'approved'`,
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
      const jobDateKeys = job?.scheduled_date ? getJobDateRange(
        job.scheduled_date,
        Number(job.estimated_days) || 1,
        !!job.includes_weekends,
        job.includes_saturday !== false,
        job.includes_sunday !== false
      ) : [];
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
          const aDates = getJobDateRange(
            a.scheduled_date,
            Number(a.estimated_days) || 1,
            !!a.includes_weekends,
            a.includes_saturday !== false,
            a.includes_sunday !== false
          );
          for (const dKey of aDates) {
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
      const privateBlock = await privateJobApplicationBlock(req.params.id, auth.userId);
      if (privateBlock) return res.status(403).json({ message: privateBlock });
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
      const auth = getWebsiteAuth(req);
      const aRow = await pool.query(
        `SELECT ja.driver_id, j.contractor_id FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.id = $1 AND ja.job_id = $2`,
        [req.params.assignmentId, req.params.id]
      );
      if (aRow.rows.length === 0) return res.status(404).json({ message: "Assignment not found" });
      const { driver_id, contractor_id } = aRow.rows[0];
      if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to modify this assignment" });
      }
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
      const auth = getWebsiteAuth(req);
      await pool.query(
        `DELETE FROM job_assignments
         WHERE driver_id = $1
           AND id NOT IN (
             SELECT MIN(id) FROM job_assignments
             WHERE driver_id = $1
             GROUP BY job_id, driver_id
           )`,
        [auth.userId]
      );
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.get("/api/jobs/:id/assignments", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (jobRow.rows.length === 0) return res.status(404).json({ message: "Job not found" });
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isContractor = String(contractor_id) === auth.userId;
      const isDriver = String(driver_id) === auth.userId;
      if (!isContractor && !isDriver) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.id, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You do not have access to this job's assignments" });
        }
      }
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
      const vRow = await pool.query(`SELECT vehicle_id, driver_id FROM job_assignments WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      const approveVid = vRow.rows[0]?.vehicle_id;
      const approveDid = vRow.rows[0]?.driver_id;
      const approvedIsFleet = await isFleetAccount(approveDid);
      if (approveVid) {
        const conflicts = await findApprovedTruckConflicts([approveVid], String(req.params.id));
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
      }
      if (approveDid && !approvedIsFleet) {
        const driverConflicts = await findApprovedDriverConflicts([approveDid], String(req.params.id));
        if (driverConflicts.length > 0) {
          return res.status(409).json({ message: driverConflictMessage(driverConflicts, false), conflicts: driverConflicts });
        }
      }
      const approveUpdate = await pool.query(
        `UPDATE job_assignments SET status = 'approved', approved_at = NOW()
         WHERE id = $1 AND job_id = $2 AND status::text <> 'approved'`,
        [req.params.assignmentId, req.params.id]
      );
      await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      await withdrawConflictingPendingApplications(String(req.params.id), [approveVid], approvedIsFleet ? [] : [approveDid], auth);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {
      });
      if (approveDid && (approveUpdate.rowCount || 0) > 0) {
        const jobRow = await pool.query(`SELECT material FROM jobs WHERE id = $1`, [req.params.id]);
        await notifyDriverJobAwarded(String(approveDid), String(req.params.id), jobRow.rows[0]?.material).catch(() => {
        });
      }
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
      const aRow = await pool.query(
        `SELECT ja.driver_id, ja.job_id, j.contractor_id FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.id = $1`,
        [req.params.assignmentId]
      );
      if (aRow.rows.length === 0) return res.status(404).json({ message: "Assignment not found" });
      const { driver_id, contractor_id, job_id: assignmentJobId } = aRow.rows[0];
      if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to modify this assignment" });
      }
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      if (vid) {
        const conflicts = await findApprovedTruckConflicts([vid], assignmentJobId);
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
      }
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
      const jobOwnership = await pool.query(
        `SELECT driver_id, contractor_id FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const jobOwner = jobOwnership.rows[0];
      const isDirectDriver = jobOwner && String(jobOwner.driver_id) === auth.userId;
      const isJobContractor = jobOwner && String(jobOwner.contractor_id) === auth.userId;
      if (!isDirectDriver && !isJobContractor) {
        const assignCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.id, auth.userId]
        );
        if (assignCheck.rows.length === 0) {
          return res.status(403).json({ code: "NOT_ASSIGNED", message: "You are not assigned to this job" });
        }
      }
      const jobRes = await pool.query(
        `SELECT id, scheduled_date, pickup_time, origin_lat, origin_lng, destination_lat, destination_lng,
                haul_both_ways, return_origin_lat, return_origin_lng, return_destination_lat, return_destination_lng
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
        if (y && m && d) {
          const scheduledDayUTC = Date.UTC(y, m - 1, d);
          const earliestAllowed = scheduledDayUTC - 24 * 60 * 60 * 1e3;
          if (startedAt.getTime() < earliestAllowed) {
            const startStr = new Date(scheduledDayUTC).toLocaleDateString("en-US", {
              timeZone: "UTC",
              weekday: "short",
              month: "short",
              day: "numeric"
            });
            return res.status(400).json({
              code: "NOT_STARTED",
              message: `This job starts ${startStr}. You can clock in any time on the job day.`,
              scheduledStartAt: new Date(scheduledDayUTC).toISOString()
            });
          }
        }
      }
      const startLat = req.body?.lat ?? req.body?.start_lat ?? null;
      const startLng = req.body?.lng ?? req.body?.start_lng ?? null;
      const GEOFENCE_MILES = 15;
      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      const bothWays = job.haul_both_ways === true;
      const roLat = bothWays && job.return_origin_lat ? Number(job.return_origin_lat) : null;
      const roLng = bothWays && job.return_origin_lng ? Number(job.return_origin_lng) : null;
      const rdLat = bothWays && job.return_destination_lat ? Number(job.return_destination_lat) : null;
      const rdLng = bothWays && job.return_destination_lng ? Number(job.return_destination_lng) : null;
      const hasReturnCoords = roLat != null && roLng != null || rdLat != null && rdLng != null;
      const hasJobCoords = oLat != null && oLng != null || dLat != null && dLng != null || hasReturnCoords;
      if (hasJobCoords) {
        if (startLat == null || startLng == null) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again."
          });
        }
        const driverLat = Number(startLat);
        const driverLng = Number(startLng);
        if (isNaN(driverLat) || isNaN(driverLng) || driverLat === 0 && driverLng === 0) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again."
          });
        }
        const legAir = [
          airMilesToLeg(driverLat, driverLng, oLat, oLng, dLat, dLng),
          hasReturnCoords ? airMilesToLeg(driverLat, driverLng, roLat, roLng, rdLat, rdLng) : null
        ].filter((m) => m != null);
        const airMiles = Math.min(...legAir);
        if (airMiles > 1) {
          const target = oLat != null && oLng != null && dLat != null && dLng != null ? "job route" : "job site";
          const legRoad = await Promise.all([
            roadMilesToJobArea(driverLat, driverLng, oLat, oLng, dLat, dLng),
            hasReturnCoords ? roadMilesToJobArea(driverLat, driverLng, roLat, roLng, rdLat, rdLng) : Promise.resolve(null)
          ]);
          const validRoad = legRoad.filter((m) => m != null);
          const roadMiles = validRoad.length > 0 ? Math.min(...validRoad) : null;
          if (roadMiles != null) {
            if (roadMiles > GEOFENCE_MILES) {
              return res.status(403).json({
                code: "OUT_OF_GEOFENCE",
                message: `You're ${roadMiles.toFixed(1)} road miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} road miles of pickup, dropoff, or anywhere along the route.`,
                distanceMiles: Math.round(roadMiles * 10) / 10,
                geofenceMiles: GEOFENCE_MILES
              });
            }
          } else if (airMiles > GEOFENCE_MILES) {
            return res.status(403).json({
              code: "OUT_OF_GEOFENCE",
              message: `You're ${airMiles.toFixed(1)} miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} road miles of pickup, dropoff, or anywhere along the route.`,
              distanceMiles: Math.round(airMiles * 10) / 10,
              geofenceMiles: GEOFENCE_MILES
            });
          }
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
      const runRow = await pool.query(`SELECT job_id, driver_id, started_at FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { job_id: jobIdForEnd, driver_id: runDriverId, started_at: runStartedAt } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobIdForEnd]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to clock out this run" });
        }
      }
      const body = req.body || {};
      const now = /* @__PURE__ */ new Date();
      const customTime = body.custom_time || body.customTime || null;
      let endedAt = customTime ? new Date(customTime) : now;
      if (isNaN(endedAt.getTime())) endedAt = now;
      let actualMin = null;
      let billedMin = null;
      if (runStartedAt) {
        actualMin = Math.max(0, Math.round((endedAt.getTime() - new Date(runStartedAt).getTime()) / 6e4));
        billedMin = billedMinutesFrom(actualMin);
      }
      const loads = body.loads_hauled != null ? Number(body.loads_hauled) : body.loadsHauled != null ? Number(body.loadsHauled) : null;
      const endLat = body.lat != null ? Number(body.lat) : body.end_lat != null ? Number(body.end_lat) : null;
      const endLng = body.lng != null ? Number(body.lng) : body.end_lng != null ? Number(body.end_lng) : null;
      await pool.query(
        `UPDATE job_runs SET
           status = 'completed',
           ended_at = $2,
           actual_duration_minutes = COALESCE($3::int, actual_duration_minutes),
           billed_duration_minutes = COALESCE($4::int, billed_duration_minutes),
           loads_hauled = COALESCE($5::int, loads_hauled),
           end_lat = COALESCE($6::numeric, end_lat),
           end_lng = COALESCE($7::numeric, end_lng),
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.runId, endedAt, actualMin, billedMin, loads, endLat, endLng]
      );
      if (jobIdForEnd) {
        pushToWebsite(`/api/jobs/${jobIdForEnd}/end`, auth, { method: "POST", body: { ...body || {}, runId: req.params.runId } }).catch(() => {
        });
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch (e) {
      console.error("Clock-out error:", e.message);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });
  app2.post("/api/jobs/:id/truck-down", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const jobId = req.params.id;
      const rawStatus = req.body?.status;
      const clearing = rawStatus == null || rawStatus === "up" || rawStatus === "";
      const VALID = /* @__PURE__ */ new Set(["back_shortly", "out_for_day"]);
      if (!clearing && !VALID.has(rawStatus)) {
        return res.status(400).json({ message: "Invalid truck-down status" });
      }
      const newStatus = clearing ? null : rawStatus;
      const assignRes = await pool.query(
        `SELECT id FROM job_assignments WHERE job_id = $1 AND driver_id = $2
         AND status::text IN ('approved','accepted')
         ORDER BY created_at DESC LIMIT 1`,
        [jobId, auth.userId]
      );
      if (assignRes.rows.length === 0) {
        return res.status(403).json({ message: "You are not assigned to this job" });
      }
      const assignmentId = assignRes.rows[0].id;
      await pool.query(
        `UPDATE job_assignments
         SET truck_down_status = $1::text,
             truck_down_at = CASE WHEN $1::text IS NULL THEN NULL ELSE NOW() END
         WHERE id = $2`,
        [newStatus, assignmentId]
      );
      if (newStatus === "out_for_day") {
        const activeRun = await pool.query(
          `SELECT id FROM job_runs WHERE job_id = $1 AND driver_id = $2 AND status::text = 'active'
           AND started_at::date = CURRENT_DATE
           ORDER BY created_at DESC LIMIT 1`,
          [jobId, auth.userId]
        );
        if (activeRun.rows.length > 0) {
          const runId = activeRun.rows[0].id;
          await pool.query(
            `UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [runId]
          );
          pushToWebsite(`/api/jobs/${jobId}/end`, auth, { method: "POST", body: { runId } }).catch(() => {
          });
        }
      }
      const driverRow = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [auth.userId]);
      const driverName = driverRow.rows[0]?.full_name || "The driver";
      let messageBody;
      let notifTitle;
      if (newStatus === "back_shortly") {
        messageBody = `\u{1F527} Truck Down \u2014 ${driverName} will be back with you shortly.`;
        notifTitle = "Truck Down";
      } else if (newStatus === "out_for_day") {
        messageBody = `\u{1F527} Truck Down \u2014 ${driverName} is out for the day.`;
        notifTitle = "Truck Down";
      } else {
        messageBody = `\u2705 ${driverName}'s truck is back up and running.`;
        notifTitle = "Truck Back Up";
      }
      const msgId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [msgId, jobId, auth.userId, messageBody]
      );
      pushToWebsite(`/api/jobs/${jobId}/messages`, auth, { method: "POST", body: { body: messageBody } }).catch(() => {
      });
      const jobRow = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobId]);
      const contractorId = jobRow.rows[0]?.contractor_id;
      if (contractorId && String(contractorId) !== auth.userId) {
        await pool.query(
          `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
           VALUES ($1, $2, 'general', $3, $4, $5, false, NOW())`,
          [crypto.randomUUID(), contractorId, notifTitle, messageBody, jobId]
        );
      }
      return res.json(addDualKeys({
        id: assignmentId,
        truck_down_status: newStatus,
        truck_down_at: newStatus ? (/* @__PURE__ */ new Date()).toISOString() : null
      }));
    } catch (e) {
      console.error("Truck-down error:", e.message);
      return res.status(500).json({ message: "Failed to update truck status" });
    }
  });
  app2.patch("/api/job-runs/:runId", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const runRow = await pool.query(`SELECT driver_id, job_id, started_at, ended_at FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { driver_id: runDriverId, job_id: runJobId, started_at: existingStart, ended_at: existingEnd } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to update this run" });
        }
      }
      const body = { ...req.body };
      if ("started_at" in body || "ended_at" in body || "startedAt" in body || "endedAt" in body) {
        const s = body.started_at ?? body.startedAt ?? existingStart;
        const e = body.ended_at ?? body.endedAt ?? existingEnd;
        if (s && e) {
          const sd = new Date(s), ed = new Date(e);
          if (!isNaN(sd.getTime()) && !isNaN(ed.getTime()) && ed.getTime() > sd.getTime()) {
            const actual = Math.max(0, Math.round((ed.getTime() - sd.getTime()) / 6e4));
            body.actual_duration_minutes = actual;
            body.billed_duration_minutes = billedMinutesFrom(actual);
          }
        }
      }
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(body)) {
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
      const auth = getWebsiteAuth(req);
      const runRow = await pool.query(`SELECT driver_id, job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.json({ ok: true });
      const { driver_id: runDriverId, job_id: runJobId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to delete this run" });
        }
      }
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
      const runResult = await pool.query(`SELECT job_id, driver_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runResult.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { job_id: jobId, driver_id: runDriverId } = runResult.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to add tickets to this run" });
        }
      }
      await pool.query(
        `INSERT INTO weight_tickets (id, job_run_id, job_id, driver_id, weight_value, notes, image_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data || req.body.image_base64 || req.body.imageBase64]
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
      const auth = getWebsiteAuth(req);
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.json([]);
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) return res.status(403).json({ message: "You do not have access to these weight tickets" });
      }
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1 ORDER BY created_at`, [req.params.jobId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });
  app2.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const runRow = await pool.query(`SELECT driver_id, job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.json([]);
      const { driver_id: runDriverId, job_id: runJobId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have access to these weight tickets" });
        }
      }
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
      const auth = getWebsiteAuth(req);
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length > 0) {
        const { contractor_id, driver_id } = jobRow.rows[0];
        if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to delete this conversation" });
        }
      }
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
      const auth = getWebsiteAuth(req);
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.json([]);
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You do not have access to this conversation" });
        }
      }
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
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.status(404).json({ message: "Job not found" });
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You are not a participant in this conversation" });
        }
      }
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
    await hydrateUserFromDb(auth.user);
    return res.json(userPayload(auth.user, auth.originalRole));
  });
  app2.put("/api/profile", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const PROFILE_ALLOWLIST = /* @__PURE__ */ new Set([
      "fullName",
      "full_name",
      "phone",
      "profileImageUrl",
      "profile_image_url",
      "bio",
      "primaryLocation",
      "primary_location",
      "secondaryLocation",
      "secondary_location",
      "truckType",
      "truck_type",
      "truckCapacity",
      "truck_capacity",
      "cdlClass",
      "cdl_class",
      "insuranceInfo",
      "insurance_info",
      "company",
      "website",
      "address",
      "city",
      "state",
      "zipCode",
      "zip_code",
      "alsoDriver",
      "also_driver",
      "notificationPreferences",
      "notification_preferences",
      "expoPushToken",
      "expo_push_token",
      "confirmationSoundEnabled",
      "confirmation_sound_enabled"
    ]);
    const safeBody = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (PROFILE_ALLOWLIST.has(k)) {
        safeBody[k] = v;
      }
    }
    if ("also_driver" in safeBody || "alsoDriver" in safeBody) {
      const accountRole = String(auth.originalRole || auth.user?.role || "");
      if (!accountRole.includes("trucking_company")) {
        return res.status(403).json({ message: "Only trucking company accounts can enable 'I also drive'." });
      }
    }
    Object.assign(auth.user, safeBody);
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      for (const [k, v] of Object.entries(safeBody)) {
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
    return res.json(userPayload(auth.user, auth.originalRole));
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
    return res.json(userPayload(auth.user, auth.originalRole));
  });
  app2.put("/api/profile/role", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }
    const baseRole = auth.originalRole || auth.user.role;
    const entitlementRoles = allowedRolesForUser(String(baseRole));
    const SELF_SERVE_COMPANY_ROLES = ["trucking_company", "contractor", "trucking_company_contractor", "broker"];
    const permitted = new Set(entitlementRoles);
    if (SELF_SERVE_COMPANY_ROLES.includes(String(baseRole))) {
      SELF_SERVE_COMPANY_ROLES.forEach((r) => permitted.add(r));
    }
    if (!permitted.has(String(role))) {
      return res.status(403).json({ message: "You are not authorized to switch to this role." });
    }
    auth.user.role = role;
    const isCompoundViewSwitch = entitlementRoles.length > 1 && entitlementRoles.includes(String(role));
    if (!String(auth.jwt).startsWith("dev-local:") && !isCompoundViewSwitch) {
      try {
        await pool.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [role, auth.userId]);
        auth.originalRole = role;
      } catch {
      }
      try {
        const ur = await websiteFetch(`/api/users/${auth.userId}`, {
          method: "PUT",
          body: { role },
          jwt: auth.jwt
        });
        if (!ur.ok) {
          console.error(`[RoleSync] Failed to push role '${role}' to website for ${auth.userId}: ${ur.status}`);
        }
      } catch (e) {
        console.error(`[RoleSync] Error pushing role to website:`, e.message);
      }
    }
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) {
      tokenToJwt.set(localToken, auth);
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json(userPayload(auth.user, auth.originalRole));
  });
  app2.get("/api/drivers/search", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const search = req.query.q || req.query.search || "";
      let query = `
        SELECT
          u.id, u.full_name, u.truck_type, u.rating, u.total_jobs,
          u.profile_image_url, u.is_connected,
          CASE WHEN EXISTS (
            SELECT 1 FROM jobs j
            WHERE (j.contractor_id = $1 OR j.driver_id = $1)
              AND (j.contractor_id = u.id OR j.driver_id = u.id)
          ) THEN u.email ELSE NULL END AS email,
          CASE WHEN EXISTS (
            SELECT 1 FROM jobs j
            WHERE (j.contractor_id = $1 OR j.driver_id = $1)
              AND (j.contractor_id = u.id OR j.driver_id = u.id)
          ) THEN u.phone ELSE NULL END AS phone
        FROM users u
        WHERE (u.role LIKE '%driver%' OR u.also_driver = true OR u.id = $1)`;
      const params = [auth.userId];
      if (search) {
        query += ` AND (u.full_name ILIKE $2)`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY u.rating DESC LIMIT 50`;
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
      const auth = getWebsiteAuth(req);
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
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
      const auth = getWebsiteAuth(req);
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
      deletedVehicleIds.add(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NOW(), is_active = false WHERE id = $1`, [req.params.id]);
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
    } catch (e) {
      console.error("Archive vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to archive vehicle" });
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
      const auth = getWebsiteAuth(req);
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
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
      const auth = getWebsiteAuth(req);
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.vehicleId, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
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
      for (const row of result.rows) {
        if (row.job_id || !row.message) continue;
        const m = String(row.message).match(/assigned you an? (.+?) job on (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
        if (!m) continue;
        try {
          const [, material, mo, day, yr] = m;
          const jr = await pool.query(
            `SELECT j.id FROM jobs j
              JOIN job_assignments a ON a.job_id = j.id AND a.driver_id::text = $1
                AND a.status::text NOT IN ('declined','withdrawn','rejected')
             WHERE LOWER(j.material) = LOWER($2)
               AND j.scheduled_date::date = make_date($3::int, $4::int, $5::int)
             ORDER BY j.created_at DESC LIMIT 1`,
            [String(auth.userId), material.trim(), yr, mo, day]
          );
          if (jr.rows[0]?.id) {
            row.job_id = jr.rows[0].id;
            pool.query(`UPDATE notifications SET job_id = $1 WHERE id = $2`, [row.job_id, row.id]).catch(() => {
            });
          }
        } catch {
        }
      }
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
  const HIDDEN_INVITES_FILE = "hidden_invitations.json";
  const hiddenInvitesByUser = (() => {
    try {
      const parsed = JSON.parse(readFileSync(join(DATA_DIR, HIDDEN_INVITES_FILE), "utf-8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  })();
  function hideInvitationForUser(userId, inviteId) {
    const list = hiddenInvitesByUser[userId] || (hiddenInvitesByUser[userId] = []);
    if (!list.includes(inviteId)) list.push(inviteId);
    if (list.length > 500) hiddenInvitesByUser[userId] = list.slice(list.length - 500);
    try {
      writeFileSync(join(DATA_DIR, HIDDEN_INVITES_FILE), JSON.stringify(hiddenInvitesByUser), "utf-8");
    } catch {
    }
  }
  app2.post("/api/driver-invitations", requireAuth, async (req, res) => {
    const auth = getWebsiteAuth(req);
    let role = (auth.user?.role || "").toLowerCase();
    try {
      const dbRole = await pool.query(`SELECT role FROM users WHERE id = $1`, [auth.userId]);
      const r = (dbRole.rows[0]?.role || "").toLowerCase();
      if (r) role = r.includes(role) || !role ? r : `${r}_${role}`;
    } catch {
    }
    const canInvite = role.includes("contractor") || role.includes("trucking_company");
    if (!canInvite) {
      return res.status(403).json({ message: "Only contractors and trucking companies can send invitations." });
    }
    const email = (req.body?.email || req.body?.driverEmail || "").trim().toLowerCase();
    const type = (req.body?.type || req.body?.invitationType || "driver").trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (type !== "driver" && type !== "foreman") {
      return res.status(400).json({ message: "Invitation type must be 'driver' or 'foreman'." });
    }
    if (type === "driver" && !role.includes("trucking_company")) {
      return res.status(403).json({ message: "Only trucking companies can invite drivers." });
    }
    if (type === "foreman" && !role.includes("contractor")) {
      return res.status(403).json({ message: "Only contractors can invite foremen." });
    }
    const firstName = (req.body?.firstName || req.body?.driverFirstName || "").trim();
    const lastName = (req.body?.lastName || req.body?.driverLastName || "").trim();
    const phone = (req.body?.phone || req.body?.driverPhone || "").trim();
    const message = (req.body?.message || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const payload = {
      email,
      driverEmail: email,
      driver_email: email,
      invitationType: type,
      invitation_type: type,
      type
    };
    if (firstName) {
      payload.driverFirstName = firstName;
      payload.driver_first_name = firstName;
    }
    if (lastName) {
      payload.driverLastName = lastName;
      payload.driver_last_name = lastName;
    }
    if (fullName) {
      payload.driverName = fullName;
      payload.driver_name = fullName;
    }
    if (phone) {
      payload.driverPhone = phone;
      payload.driver_phone = phone;
    }
    if (message) {
      payload.message = message;
    }
    try {
      const websiteRes = await websiteFetch("/api/invitations", {
        method: "POST",
        body: payload,
        jwt: auth.jwt
      });
      const text2 = await websiteRes.text();
      let data = {};
      try {
        data = JSON.parse(text2);
      } catch {
      }
      if (!websiteRes.ok) {
        if (websiteRes.status === 401) {
          return res.status(401).json({ message: "Your session expired. Please try again." });
        }
        const msg = data?.message || data?.error || "Could not send the invitation. Please try again.";
        return res.status(400).json({ message: msg });
      }
      return res.json(addDualKeys(data?.invitation || data || { ok: true }));
    } catch (e) {
      console.error("Invitation send error:", e.message);
      return res.status(502).json({ message: "Could not reach the LoadLink service to send the invitation." });
    }
  });
  app2.get("/api/driver-invitations", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const role = (auth.user?.role || "").toLowerCase();
      if (!(role.includes("contractor") || role.includes("trucking_company"))) {
        return res.json([]);
      }
      if (auth.jwt) {
        try {
          const websiteRes = await websiteFetch("/api/invitations", { jwt: auth.jwt });
          if (websiteRes.ok) {
            const data = await websiteRes.json();
            const list = Array.isArray(data) ? data : data?.invitations || [];
            const seen = /* @__PURE__ */ new Set();
            const hidden = new Set(hiddenInvitesByUser[String(auth.userId)] || []);
            const unique = list.filter((inv) => {
              const id = String(inv?.id ?? "");
              if (!id || seen.has(id) || hidden.has(id)) return false;
              seen.add(id);
              return true;
            });
            return res.json(unique.map(addDualKeys));
          }
          if (websiteRes.status === 401) {
            return res.status(401).json({ message: "Your session expired. Please try again." });
          }
        } catch (e) {
          console.error("Website invitation list error:", e.message);
        }
      }
      const result = await pool.query(
        `SELECT * FROM driver_invitations
         WHERE contractor_id = $1 OR trucking_company_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [auth.userId]
      );
      const hiddenLocal = new Set(hiddenInvitesByUser[String(auth.userId)] || []);
      return res.json(result.rows.filter((r) => !hiddenLocal.has(String(r.id))).map(addDualKeys));
    } catch (e) {
      console.error("Invitation list error:", e.message);
      return res.json([]);
    }
  });
  app2.delete("/api/driver-invitations/:id", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const inviteId = String(req.params.id || "").trim();
      if (!inviteId) return res.status(400).json({ message: "Missing invitation id." });
      hideInvitationForUser(String(auth.userId), inviteId);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Invitation remove error:", e.message);
      return res.status(500).json({ message: "Could not remove the invitation. Please try again." });
    }
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
                    COALESCE(cp.name, bcp.name) as project_name,
                    u.full_name as driver_name
             FROM job_runs jr
             JOIN trucks t ON jr.vehicle_id = t.id
             JOIN jobs j ON jr.job_id = j.id
             LEFT JOIN users c ON j.contractor_id = c.id
             LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
      const rawTz = Number(req.header("X-TZ-Offset"));
      const tzOffsetMin = Number.isFinite(rawTz) ? rawTz : 0;
      const today = new Date(Date.now() - tzOffsetMin * 6e4);
      today.setHours(0, 0, 0, 0);
      const horizonDays = 7;
      const lastDay = new Date(today);
      lastDay.setDate(today.getDate() + horizonDays - 1);
      const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const startDateStr = fmtDate(today);
      const endDateStr = fmtDate(lastDay);
      const isContractorOnly = role.includes("contractor") && role !== "trucking_company";
      const isPosterView = isContractorOnly || role === "broker";
      let userTrucks = [];
      let truckAssignments = [];
      let contractorJobsForDays = [];
      if (isPosterView) {
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
                    COALESCE(cp.name, bcp.name) AS project_name,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id AND ja.status::text = 'approved') AS trucks_assigned,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id) AS applications_count,
                    (SELECT COUNT(*)::int FROM job_runs jr
                       WHERE jr.job_id = j.id AND jr.status::text = 'active') AS active_run_count
               FROM jobs j
               LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
               COALESCE(cp.name, bcp.name) AS project_name
             FROM job_assignments ja
             JOIN trucks t ON ja.vehicle_id = t.id
             JOIN jobs   j ON ja.job_id     = j.id
             LEFT JOIN users               contractor ON j.contractor_id = contractor.id
             LEFT JOIN contractor_projects cp         ON j.project_id    = cp.id
             LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
        if (isPosterView) {
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
              activeRunCount: j.active_run_count || 0,
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
      let brokerConfirmations;
      if (role === "broker" && auth.jwt && !auth.jwt.startsWith("dev-local:")) {
        try {
          const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt: auth.jwt });
          if (jr.ok) {
            const bJobs = await jr.json().catch(() => []);
            const byDay = /* @__PURE__ */ new Map();
            for (const job of Array.isArray(bJobs) ? bJobs : []) {
              const jd = String(job.scheduledDate || job.scheduled_date || "").slice(0, 10);
              if (!jd) continue;
              const s = job.assignmentStats || {};
              const cur = byDay.get(jd) || { confirmed: 0, sent: 0, declined: 0, jobs: 0, held: 0, heldJobIds: [] };
              cur.confirmed += Number(s.confirmed ?? s.confirmedCount) || 0;
              cur.sent += Number(s.sent ?? s.sentCount) || 0;
              cur.declined += Number(s.declined ?? s.declinedCount) || 0;
              cur.jobs += 1;
              const heldHere = Number(s.held ?? s.heldCount) || 0;
              if (heldHere > 0) {
                cur.held += heldHere;
                cur.heldJobIds.push(String(job.id));
              }
              byDay.set(jd, cur);
            }
            brokerConfirmations = upcomingDays.map((d) => {
              const g = byDay.get(d.date) || { confirmed: 0, sent: 0, declined: 0, jobs: 0, held: 0, heldJobIds: [] };
              const totalOut = g.confirmed + g.sent;
              return {
                date: d.date,
                confirmed: g.confirmed,
                totalSent: totalOut,
                declined: g.declined,
                held: g.held,
                heldJobIds: g.heldJobIds,
                allConfirmed: totalOut > 0 && g.confirmed >= totalOut
              };
            });
          }
        } catch (e) {
          console.error("Dashboard broker confirmations error:", e.message);
        }
      }
      const dashboard = {
        brokerConfirmations,
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
      const period = req.query.period || "all";
      let dateFilter = "";
      if (period === "week") {
        dateFilter = `AND COALESCE(j.completed_date, j.scheduled_date) >= date_trunc('week', now())`;
      } else if (period === "month") {
        dateFilter = `AND COALESCE(j.completed_date, j.scheduled_date) >= date_trunc('month', now())`;
      }
      const jobsRes = await pool.query(
        `SELECT j.*, c.company AS contractor_company, c.full_name AS contractor_name
         FROM jobs j
         LEFT JOIN users c ON c.id = j.contractor_id
         WHERE (j.driver_id = $1
                OR j.id IN (SELECT job_id FROM job_assignments
                            WHERE driver_id = $1 AND status::text = 'approved'))
           AND j.archived_at IS NULL
           AND j.status::text IN ('completed', 'in_progress')
           ${dateFilter}
         ORDER BY COALESCE(j.completed_date, j.scheduled_date) DESC NULLS LAST`,
        [auth.userId]
      );
      let total = 0, paid = 0, pending = 0;
      const earnings = [];
      for (const job of jobsRes.rows) {
        const calc = await computeJobEarnings(job);
        const amount = Number(calc.earnings.toFixed(2));
        const payStatus = job.payment_status || "unpaid";
        const status = job.status === "in_progress" ? "in_progress" : payStatus;
        total += amount;
        if (payStatus === "payment_received") paid += amount;
        else pending += amount;
        const dateVal = job.completed_date || job.scheduled_date;
        earnings.push(addDualKeys({
          id: job.id,
          job_id: job.id,
          material: job.material,
          contractor_company: job.contractor_company || job.contractor_name || "",
          date: dateVal ? new Date(dateVal).toISOString() : "",
          completed_date: job.completed_date ? new Date(job.completed_date).toISOString() : null,
          billed_hours: Number((calc.totalMinutes / 60).toFixed(1)),
          rate: Number(job.rate || 0),
          rate_type: job.rate_type,
          amount,
          status,
          sessions: calc.runs.length,
          total_loads: calc.totalLoads
        }));
      }
      total = Number(total.toFixed(2));
      paid = Number(paid.toFixed(2));
      pending = Number(pending.toFixed(2));
      return res.json({
        earnings,
        stats: {
          totalEarnings: total,
          paidAmount: paid,
          pendingAmount: pending,
          total_earnings: total,
          paid_amount: paid,
          pending_amount: pending
        },
        total,
        paid,
        pending
      });
    } catch (e) {
      console.error("GET /api/earnings error:", e.message);
      return res.json({ earnings: [], stats: { totalEarnings: 0, paidAmount: 0, pendingAmount: 0 }, total: 0, paid: 0, pending: 0 });
    }
  });
  app2.get("/api/contractor/jobs", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const contractorId = auth.userId;
      const projectFilter = req.query.project_id;
      const status = req.query.status;
      const search = req.query.search;
      let query = `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'pending'), 0) as pending_applications,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'approved'), 0) as approved_assignments,
          COALESCE((SELECT COUNT(*)::int FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active'), 0) as active_run_count
        FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL`;
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
          query += ` AND (j.status::text IN ('in_progress', 'accepted', 'pending')
            OR (j.status::text NOT IN ('completed', 'cancelled')
                AND EXISTS (SELECT 1 FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active')))`;
        } else if (statusLower === "open") {
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')
            AND NOT EXISTS (SELECT 1 FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active')`;
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
      const truckType = req.query.truck_type;
      if (truckType) {
        query += ` AND j.truck_type::text = $${paramIdx}`;
        params.push(truckType);
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
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
         WHERE (j.driver_id = $1 OR j.id IN (
           SELECT ja.job_id FROM job_assignments ja
           WHERE ja.driver_id = $1
             AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users bu
               WHERE bu.id::text = j.contractor_id::text AND bu.role::text = 'broker'))))
         AND j.archived_at IS NULL
         ORDER BY j.created_at DESC`,
        [auth.userId]
      );
      const rows = result.rows.map(addDualKeys);
      try {
        const pend = await pool.query(
          `SELECT ja.id, ja.job_id, ja.sent_at
           FROM job_assignments ja
           JOIN jobs bj ON bj.id = ja.job_id
           JOIN users bu ON bu.id::text = bj.contractor_id::text AND bu.role::text = 'broker'
           WHERE ja.driver_id::text = $1
             AND ja.status::text = 'pending'
             AND ja.sent_at IS NOT NULL`,
          [auth.userId]
        );
        const byJob = new Map(pend.rows.map((r) => [String(r.job_id), r]));
        for (const row of rows) {
          const m = byJob.get(String(row.id));
          if (m) {
            row.needsConfirmation = true;
            row.needs_confirmation = true;
            row.assignmentId = m.id;
            row.assignment_id = m.id;
            row.assignmentSentAt = m.sent_at;
            row.assignment_sent_at = m.sent_at;
          }
        }
      } catch (e) {
        console.error("GET /api/driver/jobs broker annotate error:", e.message);
      }
      return res.json(rows);
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
      const dayAllowed = added === 0 ? true : !isWeekendDay ? true : includesWeekends && (dow === 6 && includesSaturday || dow === 0 && includesSunday);
      if (dayAllowed) {
        const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
        dates.push(key);
        added++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }
  async function findApprovedTruckConflicts(vehicleIds, targetJobId) {
    const vIds = Array.from(new Set((vehicleIds || []).filter((v) => !!v)));
    if (vIds.length === 0) return [];
    const jr = await pool.query(
      `SELECT scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
      [targetJobId]
    );
    const tj = jr.rows[0];
    if (!tj || !tj.scheduled_date) return [];
    const targetDates = new Set(
      getJobDateRange(
        tj.scheduled_date,
        Number(tj.estimated_days) || 1,
        !!tj.includes_weekends,
        tj.includes_saturday !== false,
        tj.includes_sunday !== false
      )
    );
    if (targetDates.size === 0) return [];
    const other = await pool.query(
      `SELECT ja.vehicle_id, j.material AS job_material, j.scheduled_date, j.estimated_days,
              j.includes_weekends, j.includes_saturday, j.includes_sunday
       FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
       WHERE ja.vehicle_id::text = ANY($1::text[])
         AND ja.job_id <> $2
         AND ja.status::text = 'approved'
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
      [vIds, targetJobId]
    );
    const conflicts = [];
    for (const r of other.rows) {
      const otherDates = getJobDateRange(
        r.scheduled_date,
        Number(r.estimated_days) || 1,
        !!r.includes_weekends,
        r.includes_saturday !== false,
        r.includes_sunday !== false
      );
      const overlap = otherDates.filter((d) => targetDates.has(d));
      if (overlap.length > 0) {
        conflicts.push({ vehicleId: r.vehicle_id, conflictDates: overlap, jobMaterial: r.job_material || null });
      }
    }
    return conflicts;
  }
  function bookingConflictMessage(conflicts) {
    const allDates = Array.from(new Set(conflicts.flatMap((c) => c.conflictDates))).sort();
    const pretty = allDates.map((d) => {
      const [, m, day] = d.split("-");
      return `${Number(m)}/${Number(day)}`;
    });
    const material = conflicts.find((c) => c.jobMaterial)?.jobMaterial;
    const onJob = material ? ` on another "${material}" job` : " on another job";
    return `That truck is already booked${onJob} for ${pretty.join(", ")}. Pick a different truck or remove the other booking first.`;
  }
  async function isFleetAccount(userId) {
    if (!userId) return false;
    const r = await pool.query(`SELECT role FROM users WHERE id::text = $1`, [String(userId)]);
    if (String(r.rows[0]?.role || "").includes("trucking_company")) return true;
    const tc = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trucks WHERE trucking_company_id::text = $1 AND archived_at IS NULL`,
      [String(userId)]
    );
    return (tc.rows[0]?.n || 0) >= 2;
  }
  async function findApprovedDriverConflicts(driverIds, targetJobId) {
    const dIds = Array.from(new Set((driverIds || []).filter((v) => !!v)));
    if (dIds.length === 0) return [];
    const jr = await pool.query(
      `SELECT scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
      [targetJobId]
    );
    const tj = jr.rows[0];
    if (!tj || !tj.scheduled_date) return [];
    const targetDates = new Set(
      getJobDateRange(
        tj.scheduled_date,
        Number(tj.estimated_days) || 1,
        !!tj.includes_weekends,
        tj.includes_saturday !== false,
        tj.includes_sunday !== false
      )
    );
    if (targetDates.size === 0) return [];
    const other = await pool.query(
      `SELECT ja.driver_id, j.material AS job_material, j.scheduled_date, j.estimated_days,
              j.includes_weekends, j.includes_saturday, j.includes_sunday
       FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
       WHERE ja.driver_id::text = ANY($1::text[])
         AND ja.job_id <> $2
         AND ja.status::text = 'approved'
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
      [dIds, targetJobId]
    );
    const conflicts = [];
    for (const r of other.rows) {
      const otherDates = getJobDateRange(
        r.scheduled_date,
        Number(r.estimated_days) || 1,
        !!r.includes_weekends,
        r.includes_saturday !== false,
        r.includes_sunday !== false
      );
      const overlap = otherDates.filter((d) => targetDates.has(d));
      if (overlap.length > 0) {
        conflicts.push({ driverId: r.driver_id, conflictDates: overlap, jobMaterial: r.job_material || null });
      }
    }
    return conflicts;
  }
  function driverConflictMessage(conflicts, self) {
    const allDates = Array.from(new Set(conflicts.flatMap((c) => c.conflictDates))).sort();
    const pretty = allDates.map((d) => {
      const [, m, day] = d.split("-");
      return `${Number(m)}/${Number(day)}`;
    });
    const material = conflicts.find((c) => c.jobMaterial)?.jobMaterial;
    const onJob = material ? ` on another "${material}" job` : " on another job";
    return self ? `You're already booked${onJob} for ${pretty.join(", ")}. You can't be on two jobs the same day \u2014 finish or drop the other booking first.` : `That driver is already booked${onJob} for ${pretty.join(", ")}. Approve them on different dates or remove the other booking first.`;
  }
  async function withdrawConflictingPendingApplications(targetJobId, vehicleIds, driverIds, auth) {
    try {
      const vIds = Array.from(new Set((vehicleIds || []).filter((v) => !!v)));
      const dIds = Array.from(new Set((driverIds || []).filter((v) => !!v)));
      if (vIds.length === 0 && dIds.length === 0) return;
      const jr = await pool.query(
        `SELECT material, scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
        [targetJobId]
      );
      const tj = jr.rows[0];
      if (!tj || !tj.scheduled_date) return;
      const targetDates = new Set(
        getJobDateRange(
          tj.scheduled_date,
          Number(tj.estimated_days) || 1,
          !!tj.includes_weekends,
          tj.includes_saturday !== false,
          tj.includes_sunday !== false
        )
      );
      if (targetDates.size === 0) return;
      const targetMaterial = tj.material || "";
      const others = await pool.query(
        `SELECT ja.id, ja.driver_id, ja.job_id, j.material AS job_material, j.scheduled_date,
                j.estimated_days, j.includes_weekends, j.includes_saturday, j.includes_sunday
         FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
         WHERE ja.job_id <> $1
           AND ja.status::text = 'pending'
           AND ( ja.vehicle_id::text = ANY($2::text[]) OR ja.driver_id::text = ANY($3::text[]) )
           AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
        [targetJobId, vIds, dIds]
      );
      const toWithdraw = [];
      for (const r of others.rows) {
        const otherDates = getJobDateRange(
          r.scheduled_date,
          Number(r.estimated_days) || 1,
          !!r.includes_weekends,
          r.includes_saturday !== false,
          r.includes_sunday !== false
        );
        const overlap = otherDates.filter((d) => targetDates.has(d));
        if (overlap.length > 0) {
          toWithdraw.push({ id: String(r.id), driverId: String(r.driver_id), jobId: String(r.job_id), jobMaterial: r.job_material || null, dates: overlap });
        }
      }
      if (toWithdraw.length === 0) return;
      const updated = await pool.query(
        `UPDATE job_assignments SET status = 'withdrawn'
         WHERE id = ANY($1::varchar[]) AND status::text = 'pending'
         RETURNING id`,
        [toWithdraw.map((w) => w.id)]
      );
      const withdrawnIds = new Set(updated.rows.map((r) => String(r.id)));
      const pulled = toWithdraw.filter((w) => withdrawnIds.has(w.id));
      if (pulled.length === 0) return;
      for (const jobId of Array.from(new Set(pulled.map((w) => w.jobId)))) {
        const remaining = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`,
          [jobId]
        );
        if ((remaining.rows[0]?.c || 0) === 0) {
          await pool.query(
            `UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1 AND status::text IN ('open', 'pending')`,
            [jobId]
          );
        }
      }
      const onJob = targetMaterial ? `a "${targetMaterial}" job` : "another job";
      for (const w of pulled) {
        const dates = Array.from(new Set(w.dates)).sort().map((d) => {
          const [, m, day] = d.split("-");
          return `${Number(m)}/${Number(day)}`;
        });
        const title = "Application withdrawn \u2014 double booking";
        const body = `Your application${w.jobMaterial ? ` for the "${w.jobMaterial}" job` : ""} was automatically withdrawn because you were approved on ${onJob} that overlaps ${dates.join(", ")}.`;
        try {
          await pool.query(
            `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
             VALUES ($1, $2, 'general', $3, $4, $5, false, NOW())`,
            [crypto.randomUUID(), w.driverId, title, body, w.jobId]
          );
        } catch (e) {
          console.error("Auto-withdraw notification insert error:", e.message);
        }
        await sendPushNotification(w.driverId, title, body, { jobId: w.jobId, type: "application_withdrawn" }).catch(() => {
        });
      }
    } catch (e) {
      console.error("withdrawConflictingPendingApplications error:", e.message);
    }
  }
  async function getJobsForCalendar(auth, role) {
    try {
      let result;
      const userRole = (auth.user?.role || "").toLowerCase();
      if (role === "contractor") {
        result = await pool.query(
          `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else if (userRole === "trucking_company") {
        result = await pool.query(
          `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE j.id IN (SELECT ja.job_id FROM job_assignments ja JOIN trucks t ON ja.vehicle_id = t.id WHERE t.trucking_company_id = $1 AND ja.status::text NOT IN ('withdrawn', 'rejected'))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text
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
      const isContractorRole = (userRole.includes("contractor") || userRole === "broker") && userRole !== "trucking_company";
      const isTruckingCompany = userRole === "trucking_company";
      const isDriverView = !isContractorRole && !isTruckingCompany;
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
            `SELECT ja.job_id, ja.vehicle_id, ja.driver_id, ja.status, t.make, t.model, t.year, t.truck_number, t.license_plate, t.truck_type, t.trucking_company_id
             FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id
             WHERE ja.job_id = ANY($1) AND ja.status::text NOT IN ('withdrawn', 'rejected')`,
            [jobIds]
          );
          for (const row of assResult.rows) {
            if (!assignmentsByJob[row.job_id]) assignmentsByJob[row.job_id] = [];
            assignmentsByJob[row.job_id].push({
              vehicleId: row.vehicle_id,
              driverId: row.driver_id,
              status: row.status,
              make: row.make,
              model: row.model,
              year: row.year,
              truckNumber: row.truck_number,
              licensePlate: row.license_plate,
              truckType: row.truck_type,
              truckCompanyId: row.trucking_company_id
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
        const allAssignments = assignmentsByJob[job.id] || [];
        const vehicleAssignments = isTruckingCompany ? allAssignments.filter((a) => String(a.truckCompanyId) === String(userId)) : isDriverView ? allAssignments.filter((a) => String(a.driverId) === String(userId)) : allAssignments;
        const rawActiveRuns = activeRunsByJob[job.id] || [];
        const activeRuns = isTruckingCompany || isDriverView ? rawActiveRuns.filter((r) => vehicleAssignments.some((a) => String(a.vehicleId) === String(r.vehicle_id))) : rawActiveRuns;
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
      case "flat_rate":
      case "per_job":
        earnings = rate;
        break;
      default:
        earnings = totalMinutes / 60 * rate;
    }
    return { earnings, totalMinutes, totalLoads, runs: runsRes.rows };
  }
  app2.get("/api/jobs/:id/billing", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const jobRes = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (String(job.contractor_id) !== String(auth.userId)) {
        return res.status(403).json({ message: "Only the job poster can view billing" });
      }
      const runsRes = await pool.query(
        `SELECT jr.driver_id, jr.vehicle_id, jr.billed_duration_minutes, jr.actual_duration_minutes,
                jr.started_at, jr.ended_at, jr.status, jr.loads_hauled,
                u.full_name AS driver_name,
                COALESCE(u.trucking_company_id::text, u.id::text) AS company_id,
                COALESCE(NULLIF(tc.company, ''), NULLIF(tc.full_name, ''), NULLIF(u.company, '')) AS company_name,
                t.truck_number, t.make, t.model, t.year
         FROM job_runs jr
         JOIN users u ON u.id::text = jr.driver_id::text
         LEFT JOIN users tc ON tc.id::text = u.trucking_company_id::text
         LEFT JOIN trucks t ON t.id::text = jr.vehicle_id::text
         WHERE jr.job_id = $1
         ORDER BY jr.started_at ASC`,
        [req.params.id]
      );
      const byDriver = /* @__PURE__ */ new Map();
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
        const truckLabel = r.truck_number ? `#${r.truck_number}` : [r.year, r.make, r.model].filter(Boolean).join(" ") || null;
        const key = String(r.driver_id);
        const e = byDriver.get(key) || {
          driver_id: key,
          driver_name: r.driver_name || null,
          company_id: String(r.company_id),
          company_name: r.company_name || null,
          trucks: [],
          minutes: 0,
          loads: 0,
          run_count: 0,
          has_active_run: false
        };
        e.minutes += mins;
        e.loads += Number(r.loads_hauled || 0);
        e.run_count += 1;
        if (r.status === "active") e.has_active_run = true;
        if (truckLabel && !e.trucks.includes(truckLabel)) e.trucks.push(truckLabel);
        byDriver.set(key, e);
      }
      const rate = Number(job.rate || 0);
      const rateType = String(job.rate_type || "per_hour");
      const isFlat = rateType === "flat" || rateType === "flat_rate" || rateType === "per_job";
      const entriesRaw = Array.from(byDriver.values());
      const entries = entriesRaw.map((e) => {
        let amount = 0;
        if (isFlat) amount = entriesRaw.length > 0 ? rate / entriesRaw.length : 0;
        else if (rateType === "per_load") amount = e.loads * rate;
        else amount = e.minutes / 60 * rate;
        return {
          ...e,
          minutes: Math.round(e.minutes),
          amount: Number(amount.toFixed(2))
        };
      }).sort((a, b) => b.amount - a.amount);
      const total = entries.reduce((s, e) => s + e.amount, 0);
      res.json(addDualKeys({
        job_id: job.id,
        rate,
        rate_type: rateType,
        entries,
        total_amount: Number(total.toFixed(2)),
        total_minutes: entries.reduce((s, e) => s + e.minutes, 0),
        total_loads: entries.reduce((s, e) => s + e.loads, 0)
      }));
    } catch (error) {
      console.error("Job billing error:", error.message);
      res.status(500).json({ message: "Failed to load job billing" });
    }
  });
  async function recomputeInvoice(invoice) {
    const isOpen = invoice.status === "open";
    let jobsRes;
    if (isOpen) {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) AS project_name FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id = j.project_id
         LEFT JOIN broker_client_projects bcp ON bcp.id::text = j.project_id
         LEFT JOIN job_runs jr ON jr.job_id = j.id
         WHERE j.invoice_id = $1
            OR (j.contractor_id = $2
                AND (j.driver_id = $3 OR jr.driver_id = $3)
                AND j.status::text IN ('completed', 'in_progress', 'accepted')
                AND (j.invoice_id IS NULL OR j.invoice_id = $1)
                AND date_trunc('month', COALESCE(j.scheduled_date, j.created_at)) = date_trunc('month', $4::timestamp))`,
        [invoice.id, invoice.contractor_id, invoice.driver_id, invoice.period_month]
      );
    } else {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) AS project_name FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id = j.project_id
         LEFT JOIN broker_client_projects bcp ON bcp.id::text = j.project_id
         WHERE j.invoice_id = $1`,
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
  async function ensureMonthlyInvoices(userId) {
    const candidates = await pool.query(
      `SELECT DISTINCT j.contractor_id,
              COALESCE(jr.driver_id, j.driver_id) AS billing_driver_id,
              date_trunc('month', COALESCE(j.scheduled_date, j.created_at)) AS bill_month
       FROM jobs j
       LEFT JOIN job_runs jr ON jr.job_id = j.id
       WHERE j.invoice_id IS NULL
         AND j.status::text IN ('completed', 'in_progress', 'accepted')
         AND COALESCE(jr.driver_id, j.driver_id) IS NOT NULL
         AND (j.contractor_id = $1 OR jr.driver_id = $1 OR j.driver_id = $1)`,
      [userId]
    );
    for (const row of candidates.rows) {
      if (!row.contractor_id || !row.billing_driver_id || !row.bill_month) continue;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const monthKey = new Date(row.bill_month).toISOString().slice(0, 7);
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`inv:${row.contractor_id}:${row.billing_driver_id}:${monthKey}`]
        );
        const existing = await client.query(
          `SELECT id FROM monthly_invoices
           WHERE contractor_id = $1 AND driver_id = $2
             AND date_trunc('month', period_month) = date_trunc('month', $3::timestamp)
           LIMIT 1`,
          [row.contractor_id, row.billing_driver_id, row.bill_month]
        );
        if (existing.rows.length === 0) {
          const d = new Date(row.bill_month);
          const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
          const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          await client.query(
            `INSERT INTO monthly_invoices (invoice_number, contractor_id, driver_id, period_month, period_label, status)
             VALUES ($1, $2, $3, $4, $5, 'open')`,
            [invoiceNumber, row.contractor_id, row.billing_driver_id, row.bill_month, label]
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw e;
      } finally {
        client.release();
      }
    }
  }
  app2.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      await ensureMonthlyInvoices(auth.userId).catch(
        (e) => console.error("ensureMonthlyInvoices error:", e.message)
      );
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
          d.state AS driver_state, d.zip_code AS driver_zip,
          d.trucking_company_id AS driver_parent_company_id,
          COALESCE(NULLIF(tcp.company, ''), NULLIF(tcp.full_name, '')) AS driver_parent_company_name,
          tcp.email AS driver_parent_company_email, tcp.phone AS driver_parent_company_phone,
          tcp.address AS driver_parent_company_address, tcp.city AS driver_parent_company_city,
          tcp.state AS driver_parent_company_state, tcp.zip_code AS driver_parent_company_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        LEFT JOIN users tcp ON tcp.id::text = d.trucking_company_id::text
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
      const auth = getWebsiteAuth(req);
      const result = await pool.query(
        `SELECT mi.*,
          c.full_name AS contractor_name, c.company AS contractor_company,
          c.email AS contractor_email, c.phone AS contractor_phone,
          c.address AS contractor_address, c.city AS contractor_city,
          c.state AS contractor_state, c.zip_code AS contractor_zip,
          d.full_name AS driver_name, d.company AS driver_company,
          d.email AS driver_email, d.phone AS driver_phone,
          d.address AS driver_address, d.city AS driver_city,
          d.state AS driver_state, d.zip_code AS driver_zip,
          d.trucking_company_id AS driver_parent_company_id,
          COALESCE(NULLIF(tcp.company, ''), NULLIF(tcp.full_name, '')) AS driver_parent_company_name,
          tcp.email AS driver_parent_company_email, tcp.phone AS driver_parent_company_phone,
          tcp.address AS driver_parent_company_address, tcp.city AS driver_parent_company_city,
          tcp.state AS driver_parent_company_state, tcp.zip_code AS driver_parent_company_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        LEFT JOIN users tcp ON tcp.id::text = d.trucking_company_id::text
        WHERE mi.id = $1 AND (mi.contractor_id = $2 OR mi.driver_id = $2)`,
        [req.params.id, auth.userId]
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
      const owned = await pool.query(
        `SELECT id FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
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
      let projects = result.rows;
      let brokerQuery = `SELECT * FROM broker_client_projects WHERE broker_id = $1`;
      if (!includeDeleted) brokerQuery += ` AND deleted_at IS NULL`;
      brokerQuery += ` ORDER BY created_at DESC`;
      const brokerResult = await pool.query(brokerQuery, [auth.userId]).catch(() => ({ rows: [] }));
      if (brokerResult.rows.length) {
        const seen = new Set(projects.map((p) => String(p.id)));
        projects = projects.concat(
          brokerResult.rows.filter((p) => !seen.has(String(p.id))).map((p) => ({ ...p, status: p.deleted_at ? "deleted" : "active" }))
        );
      }
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
      (async () => {
        await pushToWebsite("/api/contractor-projects", auth, {
          method: "POST",
          body: { id, name, site_address: siteAddress, site_lat: siteLat, site_lng: siteLng, contractorId: auth.userId }
        });
        await pushToWebsite(`/api/contractor-projects/${id}`, auth, {
          method: "PUT",
          body: { name, job_number: jobNumber, site_address: siteAddress, site_lat: siteLat, site_lng: siteLng, notes }
        });
      })().catch(() => {
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
      const owned = await pool.query(
        `SELECT id FROM contractor_projects WHERE id = $1 AND contractor_id::text = $2 AND deleted_at IS NULL`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) {
        const brokerOwned = await pool.query(
          `SELECT id FROM broker_client_projects WHERE id::text = $1 AND broker_id = $2 AND deleted_at IS NULL`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rows: [] }));
        if (brokerOwned.rows.length === 0) return res.status(404).json({ message: "Project not found" });
        const bFieldMap = {
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
          notes: "notes"
        };
        const bUpdates = [];
        const bValues = [];
        let bIdx = 1;
        for (const [bodyKey, dbCol] of Object.entries(bFieldMap)) {
          if (req.body[bodyKey] !== void 0) {
            bUpdates.push(`${dbCol} = $${bIdx}`);
            bValues.push(req.body[bodyKey]);
            bIdx++;
          }
        }
        if (bUpdates.length > 0) {
          bValues.push(req.params.id);
          await pool.query(
            `UPDATE broker_client_projects SET ${bUpdates.join(", ")} WHERE id::text = $${bIdx}`,
            bValues
          );
        }
        const bRow = await pool.query(`SELECT * FROM broker_client_projects WHERE id::text = $1`, [req.params.id]);
        const bp = bRow.rows[0] || { id: req.params.id };
        return res.json(addDualKeys({ ...bp, status: bp.deleted_at ? "deleted" : "active" }));
      }
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
      pushToWebsite(`/api/contractor-projects/${req.params.id}`, auth, {
        method: "PUT",
        body: {
          name: project.name,
          job_number: project.job_number,
          site_address: project.site_address,
          site_lat: project.site_lat,
          site_lng: project.site_lng,
          notes: project.notes
        }
      }).catch(() => {
      });
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
      if (upd.rowCount === 0) {
        const bUpd = await pool.query(
          `UPDATE broker_client_projects SET deleted_at = NOW()
           WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rowCount: 0 }));
        if (bUpd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
        return res.json({ ok: true });
      }
      pushToWebsite(`/api/contractor-projects/${req.params.id}`, auth, {
        method: "DELETE"
      }).catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });
  app2.post("/api/projects/:id/restore", requireAuth, async (req, res) => {
    try {
      const auth = getWebsiteAuth(req);
      const upd = await pool.query(
        `UPDATE contractor_projects SET status = 'active', deleted_at = NULL
         WHERE id = $1 AND contractor_id::text = $2 RETURNING *`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) {
        const bUpd = await pool.query(
          `UPDATE broker_client_projects SET deleted_at = NULL
           WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rowCount: 0 }));
        if (bUpd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
        return res.json({ ok: true });
      }
      const p = upd.rows[0];
      (async () => {
        await pushToWebsite("/api/contractor-projects", auth, {
          method: "POST",
          body: {
            id: p.id,
            name: p.name,
            site_address: p.site_address,
            site_lat: p.site_lat,
            site_lng: p.site_lng,
            contractorId: auth.userId
          }
        });
        await pushToWebsite(`/api/contractor-projects/${p.id}`, auth, {
          method: "PUT",
          body: {
            name: p.name,
            job_number: p.job_number,
            site_address: p.site_address,
            site_lat: p.site_lat,
            site_lng: p.site_lng,
            notes: p.notes
          }
        });
      })().catch(() => {
      });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to restore project" });
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
      const b = req.body;
      const jobId = b.jobId || b.job_id;
      const revieweeId = b.revieweeId || b.reviewee_id;
      const jobRow = await pool.query(
        `SELECT id, contractor_id, driver_id FROM jobs WHERE id = $1 AND status = 'completed'`,
        [jobId]
      );
      if (jobRow.rows.length === 0) {
        return res.status(400).json({ message: "Job not found or not completed" });
      }
      const job = jobRow.rows[0];
      let resolvedDriverId = job.driver_id;
      if (!resolvedDriverId) {
        const a = await pool.query(
          `SELECT driver_id FROM job_assignments WHERE job_id = $1
           AND status::text = 'approved'
           ORDER BY approved_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [jobId]
        );
        resolvedDriverId = a.rows[0]?.driver_id || null;
      }
      const callerIsContractor = String(job.contractor_id) === String(auth.userId);
      const callerIsDriver = resolvedDriverId != null && String(resolvedDriverId) === String(auth.userId);
      if (!callerIsContractor && !callerIsDriver) {
        return res.status(403).json({ message: "You did not participate in this job" });
      }
      const expectedReviewee = callerIsContractor ? resolvedDriverId : job.contractor_id;
      if (!expectedReviewee) {
        return res.status(409).json({ message: "This job has no finalized hauler to review yet." });
      }
      if (String(revieweeId) !== String(expectedReviewee)) {
        return res.status(400).json({ message: "Invalid reviewee for this job" });
      }
      const existing = await pool.query(
        `SELECT id FROM reviews WHERE job_id = $1 AND reviewer_id = $2`,
        [jobId, auth.userId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "You have already reviewed this job" });
      }
      const id = crypto.randomUUID();
      const reviewerRole = callerIsContractor ? "contractor" : "driver";
      await pool.query(
        `INSERT INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, comment, reviewer_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, jobId, auth.userId, revieweeId, b.rating, b.comment, reviewerRole]
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
        const truckDurationSeconds = Math.round(durationSeconds * 1.25);
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
  app2.get("/api/jobs/:id/road-distance", requireAuth, async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!isFinite(lat) || !isFinite(lng) || lat === 0 && lng === 0) {
        return res.status(400).json({ message: "lat and lng are required" });
      }
      const jobRes = await pool.query(
        `SELECT origin_lat, origin_lng, destination_lat, destination_lng,
                haul_both_ways, return_origin_lat, return_origin_lng, return_destination_lat, return_destination_lng
         FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });
      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      const bothWays = job.haul_both_ways === true;
      const roLat = bothWays && job.return_origin_lat ? Number(job.return_origin_lat) : null;
      const roLng = bothWays && job.return_origin_lng ? Number(job.return_origin_lng) : null;
      const rdLat = bothWays && job.return_destination_lat ? Number(job.return_destination_lat) : null;
      const rdLng = bothWays && job.return_destination_lng ? Number(job.return_destination_lng) : null;
      const hasReturnCoords = roLat != null && roLng != null || rdLat != null && rdLng != null;
      const legAir = [
        airMilesToLeg(lat, lng, oLat, oLng, dLat, dLng),
        hasReturnCoords ? airMilesToLeg(lat, lng, roLat, roLng, rdLat, rdLng) : null
      ].filter((m) => m != null);
      if (legAir.length === 0) {
        return res.status(404).json({ message: "Job has no coordinates" });
      }
      const airMiles = Math.min(...legAir);
      const legRoad = await Promise.all([
        roadMilesToJobArea(lat, lng, oLat, oLng, dLat, dLng),
        hasReturnCoords ? roadMilesToJobArea(lat, lng, roLat, roLng, rdLat, rdLng) : Promise.resolve(null)
      ]);
      const validRoad = legRoad.filter((m) => m != null);
      const roadMiles = validRoad.length > 0 ? Math.min(...validRoad) : null;
      return res.json(addDualKeys({
        road_miles: roadMiles != null ? Math.round(roadMiles * 10) / 10 : null,
        air_miles: Math.round(airMiles * 10) / 10
      }));
    } catch (err) {
      console.error("GET /api/jobs/:id/road-distance error:", err.message);
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
  startNewJobWatcher();
  startBrokerScheduledSendWorker();
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
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-TZ-Offset");
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
