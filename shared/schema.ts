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
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const truckTypeEnum = pgEnum("truck_type", [
  "tandem_dump",
  "tri_axle",
  "end_dump",
  "super_dump",
  "side_dump",
  "belly_dump",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "open",
  "accepted",
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_load",
  "load_accepted",
  "load_approved",
  "load_rejected",
  "load_completed",
  "message",
  "general",
  "foreman_invitation",
  "job_expired",
  "job_date_changed",
]);

export const userRoleEnum = pgEnum("user_role", [
  "driver",
  "contractor",
  "admin",
  "trucking_company",
  "trucking_company_contractor",
  "driver_contractor",
  "foreman",
  "driver_trucking_company",
]);

export const jobRunStatusEnum = pgEnum("job_run_status", [
  "active",
  "completed",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "payment_sent",
  "payment_received",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "open",
  "issued",
  "payment_sent",
  "payment_received",
  "void",
]);

export const recurrenceTypeEnum = pgEnum("recurrence_type", [
  "none",
  "weekly",
]);

export const loginProviderEnum = pgEnum("login_provider", [
  "replit_auth",
  "email_password",
]);

export const jobAssignmentStatusEnum = pgEnum("job_assignment_status", [
  "pending",
  "accepted",
  "approved",
  "rejected",
]);

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
});

export const jobs = pgTable("jobs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  requires_tarp: boolean("requires_tarp").default(false),
});

export const jobRuns = pgTable("job_runs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  created_at: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").references(() => users.id),
  type: notificationTypeEnum("type"),
  title: text("title"),
  message: text("message"),
  job_id: varchar("job_id").references(() => jobs.id),
  is_read: boolean("is_read").default(false),
  created_at: timestamp("created_at").defaultNow(),
});

export const jobMessages = pgTable("job_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  job_id: varchar("job_id"),
  sender_id: varchar("sender_id"),
  body: text("body"),
  read: boolean("read").default(false),
  created_at: timestamp("created_at").defaultNow(),
});

export const driverAvailability = pgTable("driver_availability", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
});

export const monthlyInvoices = pgTable("monthly_invoices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  updated_at: timestamp("updated_at"),
});

export const driverVehicles = pgTable("driver_vehicles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
});

export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const jobAssignments = pgTable("job_assignments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  job_id: varchar("job_id").references(() => jobs.id),
  driver_id: varchar("driver_id").references(() => users.id),
  vehicle_id: varchar("vehicle_id").references(() => driverVehicles.id),
  status: text("status").default("pending"),
  accepted_at: timestamp("accepted_at").defaultNow(),
  approved_at: timestamp("approved_at"),
  created_at: timestamp("created_at").defaultNow(),
  fleet_truck_id: varchar("fleet_truck_id"),
});

export const contractorProjects = pgTable("contractor_projects", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  deleted_at: timestamp("deleted_at"),
});

export const reviews = pgTable("reviews", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  job_id: varchar("job_id").references(() => jobs.id),
  reviewer_id: varchar("reviewer_id").references(() => users.id),
  reviewee_id: varchar("reviewee_id").references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  reviewer_role: text("reviewer_role"),
  created_at: timestamp("created_at").defaultNow(),
});

export const contractorFavoriteDrivers = pgTable("contractor_favorite_drivers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  contractor_id: varchar("contractor_id").references(() => users.id),
  driver_id: varchar("driver_id").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type JobMessage = typeof jobMessages.$inferSelect;
export type DriverAvailability = typeof driverAvailability.$inferSelect;
export type MonthlyInvoice = typeof monthlyInvoices.$inferSelect;
export type DriverVehicle = typeof driverVehicles.$inferSelect;
export type JobAssignment = typeof jobAssignments.$inferSelect;
export type Review = typeof reviews.$inferSelect;
