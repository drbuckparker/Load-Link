/**
 * Demo data seeder for the LoadLink Mobile Companion app.
 *
 * Login accounts (password is the DEMO_PASSWORD secret, never stored here):
 *  - demo@loadlink.com                 driver_trucking_company_contractor
 *  - demo-driver@loadlink.com          driver
 *  - demo-contractor@loadlink.com      contractor
 *  - demo-trucking-company@loadlink.com trucking_company
 *  - demo-foreman@loadlink.com         foreman
 *
 * Every login uses login_provider `email_password` and a bcrypt hash (cost 12,
 * the website's registration cost). node-bcrypt on this server and the
 * website's bcrypt verifier both accept that hash.
 *
 * Run with:  DEMO_PASSWORD is set in the environment, then
 *            npx tsx scripts/seed-demo.ts
 *
 * Properties:
 *  - Idempotent: every row id is prefixed `demo-`; the script deletes all
 *    existing `demo-%` rows (children -> parents) before re-inserting.
 *    Only `demo-%` ids are deleted. Nothing else is touched.
 *  - Transactional + fail-fast: all inserts run in one transaction and roll
 *    back on any error, so the demo is never left half-seeded.
 *  - Evergreen: dates are relative to "today", so the demo always looks current.
 */
import bcrypt from "bcrypt";
import { pool } from "../server/db";

const DEMO_EMAIL = "demo@loadlink.com";
const DEMO_DRIVER_EMAIL = "demo-driver@loadlink.com";
const DEMO_CONTRACTOR_EMAIL = "demo-contractor@loadlink.com";
const DEMO_TRUCKING_EMAIL = "demo-trucking-company@loadlink.com";
const DEMO_FOREMAN_EMAIL = "demo-foreman@loadlink.com";
const LOGIN_EMAILS = [
  DEMO_EMAIL,
  DEMO_DRIVER_EMAIL,
  DEMO_CONTRACTOR_EMAIL,
  DEMO_TRUCKING_EMAIL,
  DEMO_FOREMAN_EMAIL,
] as const;

// Website registration hashes with bcrypt cost 12. A $2a$/$2b$ hash at that
// cost verifies with both the website and this server's bcrypt.compare.
const BCRYPT_COST = 12;

function requireDemoPassword(): string {
  const password = process.env.DEMO_PASSWORD;
  if (password == null || password === "") {
    throw new Error(
      "DEMO_PASSWORD is not set. Add the DEMO_PASSWORD secret (the shared password for the demo logins) and re-run `npx tsx scripts/seed-demo.ts`. The seed does not contain a password.",
    );
  }
  return password;
}

// Date helpers: everything is relative to today so the demo never goes stale.
const BASE = new Date();
BASE.setHours(0, 0, 0, 0);
function d(offsetDays: number, hour = 8): string {
  const x = new Date(BASE);
  x.setDate(x.getDate() + offsetDays);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
}

type Row = (string | number | boolean | null)[];
function buildInsert(table: string, cols: string[], rows: Row[]) {
  const values: (string | number | boolean | null)[] = [];
  const tuples = rows.map((row) => {
    const ph = row.map((v) => {
      values.push(v);
      return `$${values.length}`;
    });
    return `(${ph.join(",")})`;
  });
  return {
    text: `INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`,
    values,
  };
}

async function main() {
  const demoPassword = requireDemoPassword();
  const demoHash = bcrypt.hashSync(demoPassword, BCRYPT_COST);
  if (!/^\$2[aby]\$\d{2}\$/.test(demoHash) || !bcrypt.compareSync(demoPassword, demoHash)) {
    throw new Error("bcrypt hash is not verifiable by the mobile server's bcrypt library.");
  }

  // ADD VALUE cannot run inside a transaction block; do it first, idempotently.
  await pool.query(
    "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver_trucking_company_contractor'",
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = (q: { text: string; values: Row }) =>
      client.query(q.text, q.values);

    // ---- Cleanup (children -> parents) -------------------------------------
    const delOrder = [
      "job_runs",
      "job_messages",
      "reviews",
      "notifications",
      "job_assignments",
      "driver_availability",
      "monthly_invoices",
      "contractor_materials",
      "jobs",
      "contractor_projects",
      "driver_vehicles",
      "trucks",
      "users",
    ];
    for (const t of delOrder) {
      await client.query(`DELETE FROM ${t} WHERE id LIKE 'demo-%'`);
    }

    // ---- Users -------------------------------------------------------------
    const uCols = [
      "id", "password", "role", "full_name", "first_name", "last_name", "phone",
      "email", "company", "truck_type", "rating", "total_jobs", "address", "city",
      "state", "zip_code", "trucking_company_id", "fleet_size", "also_driver",
      "is_connected", "login_provider", "business_type", "years_in_business",
      "dot_number_company", "mc_number_company", "primary_location_address",
      "primary_location_lat", "primary_location_lng", "search_radius_miles",
      "contractor_affiliation_id", "foreman_activated",
    ];
    // foreman_activated is NOT NULL with a default. Listing the column and
    // binding NULL would override that default, so unspecified rows get false.
    const U = (o: Record<string, any>): Row =>
      uCols.map((c) => {
        if (o[c] !== undefined) return o[c];
        if (c === "foreman_activated") return false;
        return null;
      });
    const login = { password: demoHash, login_provider: "email_password", is_connected: true, primary_location_address: "Sacramento, CA", primary_location_lat: "38.5816", primary_location_lng: "-121.4944", search_radius_miles: 75, city: "Sacramento", state: "CA", zip_code: "95814" };
    const users: Row[] = [
      U({ ...login, id: "demo-main", role: "driver_trucking_company_contractor", full_name: "Demo Operator", first_name: "Demo", last_name: "Operator", phone: "(916) 555-0100", email: DEMO_EMAIL, company: "LoadLink Demo Co", truck_type: "tri_axle", rating: "4.90", total_jobs: 128, address: "1200 K St", trucking_company_id: "demo-main", fleet_size: 5, also_driver: true, business_type: "Trucking & Construction", years_in_business: 12, dot_number_company: "1234567", mc_number_company: "7654321" }),
      U({ ...login, id: "demo-driver", role: "driver", full_name: "Dana Driver", first_name: "Dana", last_name: "Driver", phone: "(916) 555-0201", email: DEMO_DRIVER_EMAIL, truck_type: "tri_axle", rating: "4.85", total_jobs: 42, address: "800 J St" }),
      U({ ...login, id: "demo-contractor", role: "contractor", full_name: "Casey Contractor", first_name: "Casey", last_name: "Contractor", phone: "(916) 555-0202", email: DEMO_CONTRACTOR_EMAIL, company: "Demo Contracting LLC", rating: "4.70", total_jobs: 86, address: "4100 Demo Site Rd", business_type: "General Contractor", years_in_business: 8 }),
      U({ ...login, id: "demo-trucking", role: "trucking_company", full_name: "Terry Trucking", first_name: "Terry", last_name: "Trucking", phone: "(916) 555-0203", email: DEMO_TRUCKING_EMAIL, company: "Demo Trucking Co", rating: "4.80", total_jobs: 64, address: "2500 Fleet Way", fleet_size: 3, business_type: "Trucking", years_in_business: 6, dot_number_company: "2233445", mc_number_company: "5544332" }),
      U({ ...login, id: "demo-foreman", role: "foreman", full_name: "Frankie Foreman", first_name: "Frankie", last_name: "Foreman", phone: "(916) 555-0204", email: DEMO_FOREMAN_EMAIL, company: "Demo Contracting LLC", rating: "4.60", total_jobs: 28, address: "4100 Demo Site Rd", contractor_affiliation_id: "demo-contractor", foreman_activated: true }),
      U({ id: "demo-drv-1", role: "driver", full_name: "Mike Hauler", first_name: "Mike", last_name: "Hauler", phone: "(916) 555-0111", email: "mike@loadlink.demo", truck_type: "tandem_dump", rating: "4.80", total_jobs: 64, city: "Sacramento", state: "CA", zip_code: "95820", trucking_company_id: "demo-main", is_connected: true }),
      U({ id: "demo-drv-2", role: "driver", full_name: "Carlos Diaz", first_name: "Carlos", last_name: "Diaz", phone: "(916) 555-0112", email: "carlos@loadlink.demo", truck_type: "tri_axle", rating: "4.95", total_jobs: 91, city: "Elk Grove", state: "CA", zip_code: "95624", trucking_company_id: "demo-main", is_connected: true }),
      U({ id: "demo-drv-3", role: "driver", full_name: "Tina Brooks", first_name: "Tina", last_name: "Brooks", phone: "(916) 555-0113", email: "tina@loadlink.demo", truck_type: "end_dump", rating: "4.70", total_jobs: 48, city: "Roseville", state: "CA", zip_code: "95661", trucking_company_id: "demo-main", is_connected: true }),
      U({ id: "demo-drv-4", role: "driver", full_name: "Sam Reed", first_name: "Sam", last_name: "Reed", phone: "(916) 555-0114", email: "sam@loadlink.demo", truck_type: "super_dump", rating: "4.60", total_jobs: 33, city: "Folsom", state: "CA", zip_code: "95630", is_connected: true }),
      U({ id: "demo-drv-5", role: "driver", full_name: "Jamal White", first_name: "Jamal", last_name: "White", phone: "(916) 555-0115", email: "jamal@loadlink.demo", truck_type: "side_dump", rating: "4.85", total_jobs: 77, city: "Davis", state: "CA", zip_code: "95616", is_connected: true }),
      U({ id: "demo-con-1", role: "contractor", full_name: "Apex Construction", first_name: "Apex", last_name: "Construction", phone: "(916) 555-0121", email: "dispatch@apex.demo", company: "Apex Construction LLC", rating: "4.75", total_jobs: 210, city: "Sacramento", state: "CA", zip_code: "95811", is_connected: true }),
      U({ id: "demo-con-2", role: "contractor", full_name: "Sterling Builders", first_name: "Sterling", last_name: "Builders", phone: "(916) 555-0122", email: "dispatch@sterling.demo", company: "Sterling Builders Inc", rating: "4.65", total_jobs: 154, city: "Roseville", state: "CA", zip_code: "95678", is_connected: true }),
      U({ id: "demo-con-3", role: "contractor", full_name: "Granite Roadworks", first_name: "Granite", last_name: "Roadworks", phone: "(916) 555-0123", email: "dispatch@granite.demo", company: "Granite Roadworks Co", rating: "4.90", total_jobs: 302, city: "Rancho Cordova", state: "CA", zip_code: "95670", is_connected: true }),
    ];
    await run(buildInsert("users", uCols, users));

    // ---- Trucks (fleet owned by demo-main) ---------------------------------
    const tCols = ["id", "trucking_company_id", "assigned_driver_id", "truck_type", "make", "model", "year", "license_plate", "truck_number", "color", "capacity", "has_tarp", "is_active", "sort_order"];
    const T = (o: Record<string, any>): Row => tCols.map((c) => (o[c] === undefined ? null : o[c]));
    const trucks: Row[] = [
      T({ id: "demo-truck-1", trucking_company_id: "demo-main", assigned_driver_id: "demo-drv-1", truck_type: "tandem_dump", make: "Peterbilt", model: "567", year: 2022, license_plate: "8XYZ123", truck_number: "T-101", color: "Safety Orange", capacity: "15 tons", has_tarp: true, is_active: true, sort_order: 1 }),
      T({ id: "demo-truck-2", trucking_company_id: "demo-main", assigned_driver_id: "demo-drv-2", truck_type: "tri_axle", make: "Kenworth", model: "T880", year: 2021, license_plate: "7ABC456", truck_number: "T-102", color: "White", capacity: "18 tons", has_tarp: true, is_active: true, sort_order: 2 }),
      T({ id: "demo-truck-3", trucking_company_id: "demo-main", assigned_driver_id: "demo-drv-3", truck_type: "end_dump", make: "Mack", model: "Granite", year: 2023, license_plate: "9DEF789", truck_number: "T-103", color: "Red", capacity: "22 tons", has_tarp: false, is_active: true, sort_order: 3 }),
      T({ id: "demo-truck-4", trucking_company_id: "demo-main", assigned_driver_id: null, truck_type: "super_dump", make: "Western Star", model: "4900", year: 2020, license_plate: "5GHI012", truck_number: "T-104", color: "Black", capacity: "26 tons", has_tarp: true, is_active: true, sort_order: 4 }),
      T({ id: "demo-truck-5", trucking_company_id: "demo-main", assigned_driver_id: null, truck_type: "belly_dump", make: "Freightliner", model: "122SD", year: 2022, license_plate: "4JKL345", truck_number: "T-105", color: "Blue", capacity: "24 tons", has_tarp: false, is_active: true, sort_order: 5 }),
      // Fitting trucks for the E2E accept load (tri_axle, tarp, 18 tons). Accept
      // checks trucks the caller owns (trucking_company_id) or is assigned to.
      T({ id: "demo-truck-driver", trucking_company_id: "demo-driver", assigned_driver_id: "demo-driver", truck_type: "tri_axle", make: "Peterbilt", model: "389", year: 2021, license_plate: "DRV0001", truck_number: "D-1", color: "White", capacity: "18 tons", has_tarp: true, is_active: true, sort_order: 1 }),
      T({ id: "demo-truck-tc", trucking_company_id: "demo-trucking", assigned_driver_id: null, truck_type: "tri_axle", make: "Kenworth", model: "T880", year: 2022, license_plate: "TC0001", truck_number: "F-1", color: "Safety Orange", capacity: "18 tons", has_tarp: true, is_active: true, sort_order: 1 }),
    ];
    await run(buildInsert("trucks", tCols, trucks));

    // ---- Driver vehicles ---------------------------------------------------
    const vCols = ["id", "driver_id", "truck_type", "make", "model", "year", "license_plate", "vin_number", "is_active", "is_primary", "max_capacity_tons", "truck_number"];
    const V = (o: Record<string, any>): Row => vCols.map((c) => (o[c] === undefined ? null : o[c]));
    const vehicles: Row[] = [
      V({ id: "demo-veh-main", driver_id: "demo-main", truck_type: "tri_axle", make: "Peterbilt", model: "389", year: 2021, license_plate: "DEMO001", vin_number: "1XPBD49X1MD000001", is_active: true, is_primary: true, max_capacity_tons: "18.00", truck_number: "OWN-1" }),
      V({ id: "demo-veh-d4", driver_id: "demo-drv-4", truck_type: "super_dump", make: "Kenworth", model: "W900", year: 2019, license_plate: "SAM4444", is_active: true, is_primary: true, max_capacity_tons: "26.00" }),
      V({ id: "demo-veh-d5", driver_id: "demo-drv-5", truck_type: "side_dump", make: "Volvo", model: "VHD", year: 2020, license_plate: "JAM5555", is_active: true, is_primary: true, max_capacity_tons: "24.00" }),
      V({ id: "demo-veh-driver", driver_id: "demo-driver", truck_type: "tri_axle", make: "Peterbilt", model: "389", year: 2021, license_plate: "DRV0001", vin_number: "1XPBD49X1MD000201", is_active: true, is_primary: true, max_capacity_tons: "18.00", truck_number: "D-1" }),
    ];
    await run(buildInsert("driver_vehicles", vCols, vehicles));

    // ---- Contractor projects (owned by demo-main) --------------------------
    const pCols = ["id", "contractor_id", "name", "job_number", "awarded_amount", "status", "notes", "site_address", "site_lat", "site_lng", "site_address_type"];
    const P = (o: Record<string, any>): Row => pCols.map((c) => (o[c] === undefined ? null : o[c]));
    const projects: Row[] = [
      P({ id: "demo-proj-1", contractor_id: "demo-main", name: "Downtown Tower Foundation", job_number: "JOB-2026-001", awarded_amount: "2500000", status: "active", notes: "High-rise foundation, heavy export of spoils.", site_address: "500 Capitol Mall, Sacramento, CA", site_lat: "38.5781", site_lng: "-121.5048", site_address_type: "dropoff" }),
      P({ id: "demo-proj-2", contractor_id: "demo-main", name: "Highway 50 Resurfacing", job_number: "JOB-2026-002", awarded_amount: "1800000", status: "active", notes: "Night paving, asphalt millings haul-off.", site_address: "US-50 & Watt Ave, Sacramento, CA", site_lat: "38.5599", site_lng: "-121.3855", site_address_type: "dropoff" }),
      P({ id: "demo-proj-3", contractor_id: "demo-main", name: "Riverside Mall Site Prep", job_number: "JOB-2025-014", awarded_amount: "950000", status: "completed", notes: "Completed grading and import of base rock.", site_address: "2401 Riverside Blvd, Sacramento, CA", site_lat: "38.5436", site_lng: "-121.5043", site_address_type: "dropoff" }),
      P({ id: "demo-proj-4", contractor_id: "demo-main", name: "Airport Expansion Phase 1", job_number: "JOB-2026-003", awarded_amount: "4200000", status: "active", notes: "Large fill import operation, multi-truck daily.", site_address: "6900 Airport Blvd, Sacramento, CA", site_lat: "38.6951", site_lng: "-121.5910", site_address_type: "dropoff" }),
      P({ id: "demo-proj-e2e", contractor_id: "demo-contractor", name: "Demo Contracting Yard", job_number: "JOB-E2E-001", awarded_amount: "450000", status: "active", notes: "Open work the contractor and affiliated foreman manage.", site_address: "4100 Demo Site Rd, Sacramento, CA", site_lat: "38.5816", site_lng: "-121.4944", site_address_type: "dropoff" }),
    ];
    await run(buildInsert("contractor_projects", pCols, projects));

    // ---- Contractor materials ---------------------------------------------
    const mCols = ["id", "contractor_id", "name", "normalized_name", "usage_count"];
    const materials: Row[] = ([
      ["3/4 Crush", 18], ["Base Rock", 24], ["Fill Dirt", 31], ["Sand", 12], ["Asphalt Millings", 9], ["Topsoil", 7],
    ] as [string, number][]).map((m, i) => [`demo-mat-${i + 1}`, "demo-main", m[0], m[0].toLowerCase(), m[1]]);
    await run(buildInsert("contractor_materials", mCols, materials));

    // ---- Jobs --------------------------------------------------------------
    const jCols = ["id", "contractor_id", "driver_id", "project_id", "material", "origin_address", "destination_address", "distance", "rate", "rate_type", "truck_type", "status", "urgent", "scheduled_date", "completed_date", "pickup_time", "payment_status", "trucks_needed", "total_tons_needed", "job_type", "estimated_trips", "listed_days", "requires_tarp", "requires_weight_tickets", "origin_lat", "origin_lng", "destination_lat", "destination_lng"];
    const J = (o: Record<string, any>): Row => jCols.map((c) => (o[c] === undefined ? null : o[c]));
    // NOTE: columns with DB defaults (e.g. `urgent`) MUST be given a value here.
    // A parametrized INSERT that lists the column and passes NULL overrides the
    // default and fails the NOT NULL constraint, so `urgent` defaults to false.
    const jDef = { urgent: false, origin_address: "Teichert Aggregates, 3500 Brighton Ave, Sacramento, CA", distance: "14.50", pickup_time: "06:30 AM", job_type: "multi_load", listed_days: "1.0", requires_tarp: false, requires_weight_tickets: true, origin_lat: "38.5816", origin_lng: "-121.4944", destination_lat: "38.5781", destination_lng: "-121.5048" };
    const cAddr: Record<string, string> = { "demo-con-1": "1801 L St, Sacramento, CA", "demo-con-2": "900 Reserve Dr, Roseville, CA", "demo-con-3": "3100 Data Dr, Rancho Cordova, CA" };
    const jobs: Row[] = [];
    const add = (o: Record<string, any>) => jobs.push(J({ ...jDef, ...o }));
    const dadd = (o: Record<string, any>) => jobs.push(J({ ...jDef, ...o, destination_address: cAddr[o.contractor_id] }));

    // Contractor-posted jobs (demo-main is the contractor)
    add({ id: "demo-job-c01", contractor_id: "demo-main", driver_id: "demo-drv-1", project_id: "demo-proj-1", material: "Fill Dirt", destination_address: "500 Capitol Mall, Sacramento, CA", rate: "85.00", rate_type: "per_hour", truck_type: "tandem_dump", status: "completed", scheduled_date: d(-28), completed_date: d(-28, 15), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "180.00", estimated_trips: 12 });
    add({ id: "demo-job-c02", contractor_id: "demo-main", driver_id: "demo-drv-2", project_id: "demo-proj-1", material: "Fill Dirt", destination_address: "500 Capitol Mall, Sacramento, CA", rate: "90.00", rate_type: "per_hour", truck_type: "tri_axle", status: "completed", scheduled_date: d(-22), completed_date: d(-22, 16), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "220.00", estimated_trips: 11 });
    add({ id: "demo-job-c03", contractor_id: "demo-main", driver_id: "demo-drv-3", project_id: "demo-proj-3", material: "Base Rock", destination_address: "2401 Riverside Blvd, Sacramento, CA", rate: "1200.00", rate_type: "flat_rate", truck_type: "end_dump", status: "completed", scheduled_date: d(-18), completed_date: d(-18, 14), payment_status: "payment_sent", trucks_needed: 1, total_tons_needed: "260.00", estimated_trips: 10 });
    add({ id: "demo-job-c04", contractor_id: "demo-main", driver_id: "demo-drv-1", project_id: "demo-proj-4", material: "Import Fill", destination_address: "6900 Airport Blvd, Sacramento, CA", rate: "88.00", rate_type: "per_hour", truck_type: "tandem_dump", status: "in_progress", scheduled_date: d(0, 6), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "150.00", estimated_trips: 10, urgent: true });
    add({ id: "demo-job-c05", contractor_id: "demo-main", driver_id: "demo-drv-2", project_id: "demo-proj-2", material: "Asphalt Millings", destination_address: "US-50 & Watt Ave, Sacramento, CA", rate: "95.00", rate_type: "per_hour", truck_type: "tri_axle", status: "in_progress", scheduled_date: d(0, 7), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "200.00", estimated_trips: 9 });
    add({ id: "demo-job-c06", contractor_id: "demo-main", driver_id: "demo-drv-3", project_id: "demo-proj-4", material: "Import Fill", destination_address: "6900 Airport Blvd, Sacramento, CA", rate: "1400.00", rate_type: "flat_rate", truck_type: "end_dump", status: "accepted", scheduled_date: d(2), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "240.00", estimated_trips: 9 });
    add({ id: "demo-job-c07", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-4", material: "Import Fill", destination_address: "6900 Airport Blvd, Sacramento, CA", rate: "92.00", rate_type: "per_hour", truck_type: "tri_axle", status: "open", scheduled_date: d(3), payment_status: "unpaid", trucks_needed: 3, total_tons_needed: "600.00", estimated_trips: 24, listed_days: "2.0" });
    add({ id: "demo-job-c08", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-2", material: "Asphalt Millings", destination_address: "US-50 & Watt Ave, Sacramento, CA", rate: "1300.00", rate_type: "flat_rate", truck_type: "end_dump", status: "open", scheduled_date: d(5), payment_status: "unpaid", trucks_needed: 2, total_tons_needed: "400.00", estimated_trips: 16 });
    add({ id: "demo-job-c09", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-1", material: "Fill Dirt", destination_address: "500 Capitol Mall, Sacramento, CA", rate: "87.00", rate_type: "per_hour", truck_type: "tandem_dump", status: "open", scheduled_date: d(6), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "160.00", estimated_trips: 10 });
    add({ id: "demo-job-c10", contractor_id: "demo-main", driver_id: "demo-drv-4", project_id: "demo-proj-4", material: "Import Fill", destination_address: "6900 Airport Blvd, Sacramento, CA", rate: "1500.00", rate_type: "flat_rate", truck_type: "super_dump", status: "accepted", scheduled_date: d(1), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "300.00", estimated_trips: 8 });
    add({ id: "demo-job-c11", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-4", material: "Import Fill", destination_address: "6900 Airport Blvd, Sacramento, CA", rate: "98.00", rate_type: "per_hour", truck_type: "tri_axle", status: "open", scheduled_date: d(7), payment_status: "unpaid", trucks_needed: 2, total_tons_needed: "420.00", estimated_trips: 18, urgent: true });
    add({ id: "demo-job-c12", contractor_id: "demo-main", driver_id: "demo-drv-2", project_id: "demo-proj-3", material: "Base Rock", destination_address: "2401 Riverside Blvd, Sacramento, CA", rate: "1150.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "completed", scheduled_date: d(-20), completed_date: d(-20, 15), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "210.00", estimated_trips: 9 });
    add({ id: "demo-job-c13", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-2", material: "Asphalt Millings", destination_address: "US-50 & Watt Ave, Sacramento, CA", rate: "1250.00", rate_type: "flat_rate", truck_type: "end_dump", status: "cancelled", scheduled_date: d(-3), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "180.00", estimated_trips: 7 });
    add({ id: "demo-job-c14", contractor_id: "demo-main", driver_id: "demo-drv-1", project_id: "demo-proj-1", material: "Fill Dirt", destination_address: "500 Capitol Mall, Sacramento, CA", rate: "86.00", rate_type: "per_hour", truck_type: "tandem_dump", status: "completed", scheduled_date: d(-10), completed_date: d(-10, 16), payment_status: "payment_sent", trucks_needed: 1, total_tons_needed: "170.00", estimated_trips: 11 });
    add({ id: "demo-job-c15", contractor_id: "demo-main", driver_id: null, project_id: "demo-proj-1", material: "Base Rock", destination_address: "500 Capitol Mall, Sacramento, CA", rate: "1180.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "open", scheduled_date: d(10), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "200.00", estimated_trips: 8 });

    // Driver jobs (demo-main drives for other contractors)
    dadd({ id: "demo-job-d01", contractor_id: "demo-con-1", driver_id: "demo-main", material: "3/4 Crush", rate: "92.00", rate_type: "per_hour", truck_type: "tri_axle", status: "completed", scheduled_date: d(-25), completed_date: d(-25, 16), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "190.00", estimated_trips: 10 });
    dadd({ id: "demo-job-d02", contractor_id: "demo-con-2", driver_id: "demo-main", material: "Sand", rate: "1320.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "completed", scheduled_date: d(-18), completed_date: d(-18, 15), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "205.00", estimated_trips: 9 });
    dadd({ id: "demo-job-d03", contractor_id: "demo-con-1", driver_id: "demo-main", material: "Base Rock", rate: "90.00", rate_type: "per_hour", truck_type: "tri_axle", status: "completed", scheduled_date: d(-12), completed_date: d(-12, 17), payment_status: "payment_sent", trucks_needed: 1, total_tons_needed: "175.00", estimated_trips: 11 });
    dadd({ id: "demo-job-d04", contractor_id: "demo-con-3", driver_id: "demo-main", material: "Topsoil", rate: "1280.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "completed", scheduled_date: d(-6), completed_date: d(-6, 14), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "160.00", estimated_trips: 8 });
    dadd({ id: "demo-job-d05", contractor_id: "demo-con-2", driver_id: "demo-main", material: "Asphalt Millings", rate: "94.00", rate_type: "per_hour", truck_type: "tri_axle", status: "in_progress", scheduled_date: d(0, 6), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "180.00", estimated_trips: 9 });
    dadd({ id: "demo-job-d06", contractor_id: "demo-con-1", driver_id: "demo-main", material: "3/4 Crush", rate: "91.00", rate_type: "per_hour", truck_type: "tri_axle", status: "accepted", scheduled_date: d(1), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "195.00", estimated_trips: 10 });
    dadd({ id: "demo-job-d07", contractor_id: "demo-con-3", driver_id: "demo-main", material: "Fill Dirt", rate: "1350.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "accepted", scheduled_date: d(4), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "210.00", estimated_trips: 9 });
    dadd({ id: "demo-job-d08", contractor_id: "demo-con-3", driver_id: "demo-main", material: "Base Rock", rate: "88.00", rate_type: "per_hour", truck_type: "tri_axle", status: "completed", scheduled_date: d(-31), completed_date: d(-31, 16), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "200.00", estimated_trips: 10 });
    dadd({ id: "demo-job-d09", contractor_id: "demo-con-2", driver_id: "demo-main", material: "Sand", rate: "96.00", rate_type: "per_hour", truck_type: "tri_axle", status: "accepted", scheduled_date: d(8), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "185.00", estimated_trips: 9 });
    dadd({ id: "demo-job-d10", contractor_id: "demo-con-1", driver_id: "demo-main", material: "3/4 Crush", rate: "1300.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "completed", scheduled_date: d(-2), completed_date: d(-2, 15), payment_status: "payment_received", trucks_needed: 1, total_tons_needed: "170.00", estimated_trips: 8 });

    // Open browseable jobs from other contractors (no driver assigned)
    const owners = ["demo-con-1", "demo-con-2", "demo-con-3"];
    const omats = ["3/4 Crush", "Sand", "Base Rock", "Topsoil", "Fill Dirt", "Asphalt Millings", "Base Rock", "3/4 Crush"];
    const otype = ["tri_axle", "tandem_dump", "end_dump", "super_dump", "tri_axle", "end_dump", "tandem_dump", "tri_axle"];
    for (let i = 0; i < 8; i++) {
      const c = owners[i % 3];
      jobs.push(J({ ...jDef, id: `demo-job-o${String(i + 1).padStart(2, "0")}`, contractor_id: c, driver_id: null, material: omats[i], destination_address: cAddr[c], rate: 85 + i * 2 + ".00", rate_type: i % 2 ? "flat_rate" : "per_hour", truck_type: otype[i], status: "open", scheduled_date: d(3 + i), payment_status: "unpaid", trucks_needed: (i % 2) + 1, total_tons_needed: 150 + i * 15 + ".00", estimated_trips: 8 + i, urgent: i === 2 }));
    }

    // E2E fixtures for the role logins. The accept load stays unassigned so both
    // the driver and the trucking company can take it; their tri_axle trucks
    // match truck_type, have a tarp, and meet capacity. The contractor's open
    // job is a different posting (end_dump) so accepting the load does not
    // consume it. The foreman is affiliated with demo-contractor and can open
    // that job. Message jobs are already accepted, on other days, so they do
    // not block the open load.
    const e2eSite = "4100 Demo Site Rd, Sacramento, CA";
    dadd({ id: "demo-job-e2e-accept", contractor_id: "demo-con-1", driver_id: null, material: "3/4 Crush", rate: "90.00", rate_type: "per_hour", truck_type: "tri_axle", status: "open", scheduled_date: d(12), payment_status: "unpaid", trucks_needed: 2, total_tons_needed: "200.00", estimated_trips: 8, requires_tarp: false });
    add({ id: "demo-job-e2e-contractor", contractor_id: "demo-contractor", driver_id: null, project_id: "demo-proj-e2e", material: "Base Rock", destination_address: e2eSite, rate: "1100.00", rate_type: "flat_rate", truck_type: "end_dump", status: "open", scheduled_date: d(9), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "180.00", estimated_trips: 8, requires_tarp: false });
    add({ id: "demo-job-e2e-driver-msg", contractor_id: "demo-contractor", driver_id: "demo-driver", project_id: "demo-proj-e2e", material: "Fill Dirt", destination_address: e2eSite, rate: "88.00", rate_type: "per_hour", truck_type: "tri_axle", status: "accepted", scheduled_date: d(2), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "160.00", estimated_trips: 8 });
    add({ id: "demo-job-e2e-tc-msg", contractor_id: "demo-contractor", driver_id: "demo-trucking", project_id: "demo-proj-e2e", material: "Sand", destination_address: e2eSite, rate: "1400.00", rate_type: "flat_rate", truck_type: "tri_axle", status: "accepted", scheduled_date: d(3), payment_status: "unpaid", trucks_needed: 1, total_tons_needed: "190.00", estimated_trips: 8 });
    await run(buildInsert("jobs", jCols, jobs));

    // ---- Job assignments ---------------------------------------------------
    const aCols = ["id", "job_id", "driver_id", "vehicle_id", "status", "accepted_at", "approved_at", "fleet_truck_id", "available_days"];
    const A = (o: Record<string, any>): Row => aCols.map((c) => (o[c] === undefined ? null : o[c]));
    const fleetTruck: Record<string, string> = { "demo-drv-1": "demo-truck-1", "demo-drv-2": "demo-truck-2", "demo-drv-3": "demo-truck-3" };
    const fleetVeh: Record<string, string> = { "demo-drv-4": "demo-veh-d4", "demo-drv-5": "demo-veh-d5" };
    const assigns: Row[] = [];
    let an = 0;
    const aid = () => `demo-asg-${String(++an).padStart(2, "0")}`;
    ([["demo-job-c01", "demo-drv-1", -28], ["demo-job-c02", "demo-drv-2", -22], ["demo-job-c03", "demo-drv-3", -18], ["demo-job-c04", "demo-drv-1", -1], ["demo-job-c05", "demo-drv-2", -1], ["demo-job-c06", "demo-drv-3", -2], ["demo-job-c10", "demo-drv-4", -1], ["demo-job-c12", "demo-drv-2", -20], ["demo-job-c14", "demo-drv-1", -10]] as [string, string, number][]).forEach(([job, drv, off]) =>
      assigns.push(A({ id: aid(), job_id: job, driver_id: drv, vehicle_id: fleetVeh[drv] || null, status: "approved", accepted_at: d(off - 1), approved_at: d(off), fleet_truck_id: fleetTruck[drv] || null })));
    ([["demo-job-c07", "demo-drv-4"], ["demo-job-c07", "demo-drv-5"], ["demo-job-c08", "demo-drv-4"], ["demo-job-c09", "demo-drv-5"], ["demo-job-c11", "demo-drv-4"], ["demo-job-c15", "demo-drv-5"]] as [string, string][]).forEach(([job, drv]) =>
      assigns.push(A({ id: aid(), job_id: job, driver_id: drv, vehicle_id: fleetVeh[drv] || null, status: "pending", accepted_at: d(0) })));
    ([["demo-job-d01", -25], ["demo-job-d02", -18], ["demo-job-d03", -12], ["demo-job-d04", -6], ["demo-job-d05", 0], ["demo-job-d06", 1], ["demo-job-d07", 4], ["demo-job-d08", -31], ["demo-job-d09", 8], ["demo-job-d10", -2]] as [string, number][]).forEach(([job, off]) =>
      assigns.push(A({ id: aid(), job_id: job, driver_id: "demo-main", vehicle_id: "demo-veh-main", status: "approved", accepted_at: d(off - 1), approved_at: d(off - 1) })));
    ["demo-job-o01", "demo-job-o02"].forEach((job) =>
      assigns.push(A({ id: aid(), job_id: job, driver_id: "demo-main", vehicle_id: "demo-veh-main", status: "pending", accepted_at: d(0) })));
    assigns.push(A({ id: aid(), job_id: "demo-job-e2e-driver-msg", driver_id: "demo-driver", vehicle_id: "demo-veh-driver", status: "approved", accepted_at: d(1), approved_at: d(1), fleet_truck_id: "demo-truck-driver" }));
    assigns.push(A({ id: aid(), job_id: "demo-job-e2e-tc-msg", driver_id: "demo-trucking", vehicle_id: null, status: "approved", accepted_at: d(2), approved_at: d(2), fleet_truck_id: "demo-truck-tc" }));
    await run(buildInsert("job_assignments", aCols, assigns));

    // ---- Job runs ----------------------------------------------------------
    const rCols = ["id", "job_id", "driver_id", "status", "started_at", "ended_at", "actual_duration_minutes", "billed_duration_minutes", "total_miles", "loads_hauled", "vehicle_id"];
    const R = (o: Record<string, any>): Row => rCols.map((c) => (o[c] === undefined ? null : o[c]));
    const runs: Row[] = [];
    let rn = 0;
    const rid = () => `demo-run-${String(++rn).padStart(2, "0")}`;
    ([["demo-job-c01", "demo-drv-1", -28, 510], ["demo-job-c02", "demo-drv-2", -22, 540], ["demo-job-c03", "demo-drv-3", -18, 480], ["demo-job-c12", "demo-drv-2", -20, 500], ["demo-job-c14", "demo-drv-1", -10, 520], ["demo-job-d01", "demo-main", -25, 560], ["demo-job-d02", "demo-main", -18, 500], ["demo-job-d03", "demo-main", -12, 540], ["demo-job-d04", "demo-main", -6, 470], ["demo-job-d08", "demo-main", -31, 520], ["demo-job-d10", "demo-main", -2, 460]] as [string, string, number, number][]).forEach(([job, drv, off, mins]) =>
      runs.push(R({ id: rid(), job_id: job, driver_id: drv, status: "completed", started_at: d(off, 6), ended_at: d(off, 6 + Math.round(mins / 60)), actual_duration_minutes: mins, billed_duration_minutes: mins, total_miles: (mins / 4).toFixed(2), loads_hauled: Math.round(mins / 50), vehicle_id: drv === "demo-main" ? "demo-veh-main" : null })));
    ([["demo-job-c04", "demo-drv-1"], ["demo-job-c05", "demo-drv-2"], ["demo-job-d05", "demo-main"]] as [string, string][]).forEach(([job, drv]) =>
      runs.push(R({ id: rid(), job_id: job, driver_id: drv, status: "active", started_at: d(0, 6), ended_at: null, actual_duration_minutes: null, billed_duration_minutes: null, total_miles: null, loads_hauled: 3, vehicle_id: drv === "demo-main" ? "demo-veh-main" : null })));
    await run(buildInsert("job_runs", rCols, runs));

    // ---- Monthly invoices --------------------------------------------------
    const iCols = ["id", "invoice_number", "contractor_id", "driver_id", "period_month", "period_label", "total_amount", "job_count", "status", "issued_at", "due_date", "paid_at"];
    const I = (o: Record<string, any>): Row => iCols.map((c) => (o[c] === undefined ? null : o[c]));
    const invoices: Row[] = [
      I({ id: "demo-inv-d1", invoice_number: "INV-DEMO-1001", contractor_id: "demo-con-1", driver_id: "demo-main", period_month: d(-31), period_label: "Last Month", total_amount: "4200.00", job_count: 3, status: "payment_received", issued_at: d(-20), due_date: d(-5), paid_at: d(-8) }),
      I({ id: "demo-inv-d2", invoice_number: "INV-DEMO-1002", contractor_id: "demo-con-2", driver_id: "demo-main", period_month: d(-31), period_label: "Last Month", total_amount: "2800.00", job_count: 2, status: "payment_received", issued_at: d(-19), due_date: d(-4), paid_at: d(-6) }),
      I({ id: "demo-inv-d3", invoice_number: "INV-DEMO-1003", contractor_id: "demo-con-3", driver_id: "demo-main", period_month: d(0), period_label: "This Month", total_amount: "3100.00", job_count: 2, status: "issued", issued_at: d(-3), due_date: d(12) }),
      I({ id: "demo-inv-d4", invoice_number: "INV-DEMO-1004", contractor_id: "demo-con-1", driver_id: "demo-main", period_month: d(0), period_label: "This Month", total_amount: "1500.00", job_count: 1, status: "open" }),
      I({ id: "demo-inv-d5", invoice_number: "INV-DEMO-1005", contractor_id: "demo-con-2", driver_id: "demo-main", period_month: d(0), period_label: "This Month", total_amount: "2200.00", job_count: 2, status: "payment_sent", issued_at: d(-2), due_date: d(13) }),
      I({ id: "demo-inv-c1", invoice_number: "INV-DEMO-2001", contractor_id: "demo-main", driver_id: "demo-drv-1", period_month: d(-31), period_label: "Last Month", total_amount: "5200.00", job_count: 3, status: "payment_received", issued_at: d(-18), due_date: d(-3), paid_at: d(-5) }),
      I({ id: "demo-inv-c2", invoice_number: "INV-DEMO-2002", contractor_id: "demo-main", driver_id: "demo-drv-2", period_month: d(0), period_label: "This Month", total_amount: "4100.00", job_count: 2, status: "issued", issued_at: d(-2), due_date: d(13) }),
      I({ id: "demo-inv-c3", invoice_number: "INV-DEMO-2003", contractor_id: "demo-main", driver_id: "demo-drv-3", period_month: d(0), period_label: "This Month", total_amount: "1400.00", job_count: 1, status: "open" }),
      I({ id: "demo-inv-c4", invoice_number: "INV-DEMO-2004", contractor_id: "demo-main", driver_id: "demo-drv-4", period_month: d(0), period_label: "This Month", total_amount: "1500.00", job_count: 1, status: "payment_sent", issued_at: d(-1), due_date: d(14) }),
    ];
    await run(buildInsert("monthly_invoices", iCols, invoices));

    // ---- Driver availability (demo-main) -----------------------------------
    const avCols = ["id", "driver_id", "date", "start_time", "end_time", "recurrence", "day_of_week", "notes", "is_available"];
    const AV = (o: Record<string, any>): Row => avCols.map((c) => (o[c] === undefined ? null : o[c]));
    const avail: Row[] = [
      AV({ id: "demo-av-1", driver_id: "demo-main", date: d(1), start_time: "06:00", end_time: "16:00", recurrence: "none", is_available: true }),
      AV({ id: "demo-av-2", driver_id: "demo-main", date: d(2), start_time: "06:00", end_time: "16:00", recurrence: "none", is_available: true }),
      AV({ id: "demo-av-3", driver_id: "demo-main", date: d(3), start_time: "06:00", end_time: "16:00", recurrence: "none", notes: "Truck maintenance", is_available: false }),
      AV({ id: "demo-av-4", driver_id: "demo-main", date: d(5), start_time: "07:00", end_time: "17:00", recurrence: "none", is_available: true }),
      AV({ id: "demo-av-5", driver_id: "demo-main", date: d(8), start_time: "06:00", end_time: "15:00", recurrence: "none", is_available: true }),
      AV({ id: "demo-av-6", driver_id: "demo-main", date: d(9), start_time: "06:00", end_time: "16:00", recurrence: "none", is_available: true }),
      AV({ id: "demo-av-7", driver_id: "demo-main", date: d(6), start_time: "00:00", end_time: "00:00", recurrence: "weekly", day_of_week: 6, notes: "Unavailable Saturdays", is_available: false }),
    ];
    await run(buildInsert("driver_availability", avCols, avail));

    // ---- Notifications (demo-main) -----------------------------------------
    const nCols = ["id", "user_id", "type", "title", "message", "job_id", "is_read", "created_at"];
    const N = (o: Record<string, any>): Row => nCols.map((c) => (o[c] === undefined ? null : o[c]));
    const notes: Row[] = [
      N({ id: "demo-not-1", user_id: "demo-main", type: "new_load", title: "New load near you", message: "Apex Construction posted a 3/4 Crush haul to 1801 L St.", job_id: "demo-job-o01", is_read: false, created_at: d(0, 7) }),
      N({ id: "demo-not-2", user_id: "demo-main", type: "load_approved", title: "You were approved", message: "You are approved for the 3/4 Crush job tomorrow.", job_id: "demo-job-d06", is_read: false, created_at: d(0, 9) }),
      N({ id: "demo-not-3", user_id: "demo-main", type: "message", title: "New message", message: 'Sterling Builders: "Gate code is 4412."', job_id: "demo-job-d05", is_read: false, created_at: d(0, 10) }),
      N({ id: "demo-not-4", user_id: "demo-main", type: "load_completed", title: "Job completed", message: "Your run for Granite Roadworks is complete.", job_id: "demo-job-d04", is_read: true, created_at: d(-6, 15) }),
      N({ id: "demo-not-5", user_id: "demo-main", type: "load_accepted", title: "Driver applied", message: "Sam Reed applied to your Import Fill job.", job_id: "demo-job-c07", is_read: false, created_at: d(0, 8) }),
      N({ id: "demo-not-6", user_id: "demo-main", type: "general", title: "Payment received", message: "Apex Construction paid invoice INV-DEMO-1001.", job_id: null, is_read: true, created_at: d(-8, 12) }),
    ];
    await run(buildInsert("notifications", nCols, notes));

    // ---- Job messages ------------------------------------------------------
    const jmCols = ["id", "job_id", "sender_id", "body", "read", "created_at"];
    const JM = (o: Record<string, any>): Row => jmCols.map((c) => (o[c] === undefined ? null : o[c]));
    const msgs: Row[] = [
      JM({ id: "demo-msg-1", job_id: "demo-job-c07", sender_id: "demo-drv-4", body: "Hi, I can bring a super dump for this. Available all 3 days.", read: true, created_at: d(0, 8) }),
      JM({ id: "demo-msg-2", job_id: "demo-job-c07", sender_id: "demo-main", body: "Great, what time can you be on site?", read: false, created_at: d(0, 8) }),
      JM({ id: "demo-msg-3", job_id: "demo-job-d05", sender_id: "demo-con-2", body: "Gate code is 4412. Scale is on the north end.", read: false, created_at: d(0, 6) }),
      JM({ id: "demo-msg-4", job_id: "demo-job-d05", sender_id: "demo-main", body: "Copy, rolling now.", read: true, created_at: d(0, 6) }),
      JM({ id: "demo-msg-5", job_id: "demo-job-d06", sender_id: "demo-con-1", body: "See you tomorrow at 6:30. Bring weight tickets.", read: false, created_at: d(0, 11) }),
      JM({ id: "demo-msg-6", job_id: "demo-job-e2e-contractor", sender_id: "demo-contractor", body: "Foreman, this Base Rock job is open. Gate is on the east side.", read: true, created_at: d(0, 9) }),
      JM({ id: "demo-msg-7", job_id: "demo-job-e2e-contractor", sender_id: "demo-foreman", body: "Copy. I'll have the site ready for the first truck.", read: false, created_at: d(0, 10) }),
      JM({ id: "demo-msg-8", job_id: "demo-job-e2e-driver-msg", sender_id: "demo-contractor", body: "Dana, fill dirt is staged at the north pile.", read: false, created_at: d(1, 7) }),
      JM({ id: "demo-msg-9", job_id: "demo-job-e2e-driver-msg", sender_id: "demo-driver", body: "On my way. Tri-axle is empty and tarped.", read: true, created_at: d(1, 8) }),
      JM({ id: "demo-msg-10", job_id: "demo-job-e2e-tc-msg", sender_id: "demo-contractor", body: "Terry, sand job is confirmed for your tri-axle.", read: false, created_at: d(2, 7) }),
      JM({ id: "demo-msg-11", job_id: "demo-job-e2e-tc-msg", sender_id: "demo-trucking", body: "Truck F-1 is assigned. We'll be there at 6:30.", read: true, created_at: d(2, 8) }),
    ];
    await run(buildInsert("job_messages", jmCols, msgs));

    // ---- Reviews -----------------------------------------------------------
    const rvCols = ["id", "job_id", "reviewer_id", "reviewee_id", "rating", "comment", "reviewer_role", "created_at"];
    const RV = (o: Record<string, any>): Row => rvCols.map((c) => (o[c] === undefined ? null : o[c]));
    const reviews: Row[] = [
      RV({ id: "demo-rev-1", job_id: "demo-job-d01", reviewer_id: "demo-con-1", reviewee_id: "demo-main", rating: 5, comment: "On time, clean loads, great communication.", reviewer_role: "contractor", created_at: d(-24) }),
      RV({ id: "demo-rev-2", job_id: "demo-job-d02", reviewer_id: "demo-con-2", reviewee_id: "demo-main", rating: 5, comment: "Excellent driver, will book again.", reviewer_role: "contractor", created_at: d(-17) }),
      RV({ id: "demo-rev-3", job_id: "demo-job-d08", reviewer_id: "demo-con-3", reviewee_id: "demo-main", rating: 4, comment: "Solid work, slight delay on first load.", reviewer_role: "contractor", created_at: d(-30) }),
      RV({ id: "demo-rev-4", job_id: "demo-job-c01", reviewer_id: "demo-main", reviewee_id: "demo-drv-1", rating: 5, comment: "Mike crushed it, very reliable.", reviewer_role: "contractor", created_at: d(-27) }),
      RV({ id: "demo-rev-5", job_id: "demo-job-c02", reviewer_id: "demo-main", reviewee_id: "demo-drv-2", rating: 5, comment: "Carlos is a pro.", reviewer_role: "contractor", created_at: d(-21) }),
    ];
    await run(buildInsert("reviews", rvCols, reviews));

    await client.query("COMMIT");

    // ---- Post-commit invariant assertions ----------------------------------
    const expect: Record<string, number> = {
      users: 13, trucks: 7, driver_vehicles: 4, contractor_projects: 5,
      contractor_materials: 6, jobs: 37, job_assignments: 29, job_runs: 14,
      monthly_invoices: 9, driver_availability: 7, notifications: 6,
      job_messages: 11, reviews: 5,
    };
    const failures: string[] = [];
    for (const [table, want] of Object.entries(expect)) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE id LIKE 'demo-%'`,
      );
      const got = rows[0].n as number;
      const mark = got === want ? "ok" : "MISMATCH";
      if (got !== want) failures.push(`${table}: expected ${want}, got ${got}`);
      console.log(`  ${table.padEnd(22)} ${got}/${want} ${mark}`);
    }
    const { rows: loginRows } = await pool.query(
      `SELECT id, email, role::text AS role, login_provider::text AS login_provider,
              password, foreman_activated, contractor_affiliation_id
         FROM users WHERE email = ANY($1::text[])`,
      [LOGIN_EMAILS],
    );
    const expectedRoles: Record<string, string> = {
      [DEMO_EMAIL]: "driver_trucking_company_contractor",
      [DEMO_DRIVER_EMAIL]: "driver",
      [DEMO_CONTRACTOR_EMAIL]: "contractor",
      [DEMO_TRUCKING_EMAIL]: "trucking_company",
      [DEMO_FOREMAN_EMAIL]: "foreman",
    };
    for (const email of LOGIN_EMAILS) {
      const row = loginRows.find((r) => String(r.email).toLowerCase() === email);
      if (!row) {
        failures.push(`missing login ${email}`);
        continue;
      }
      if (row.role !== expectedRoles[email]) failures.push(`${email}: role ${row.role}`);
      if (row.login_provider !== "email_password") failures.push(`${email}: login_provider ${row.login_provider}`);
      if (!row.password || !/^\$2[aby]\$\d{2}\$/.test(String(row.password))) {
        failures.push(`${email}: password is not a bcrypt hash`);
      } else if (!bcrypt.compareSync(demoPassword, String(row.password))) {
        failures.push(`${email}: password hash does not match DEMO_PASSWORD`);
      }
    }
    const foreman = loginRows.find((r) => r.email === DEMO_FOREMAN_EMAIL);
    if (foreman && (foreman.foreman_activated !== true || foreman.contractor_affiliation_id !== "demo-contractor")) {
      failures.push("foreman is not activated under demo-contractor");
    }
    const { rows: acceptRows } = await pool.query(
      `SELECT j.id
         FROM jobs j
        WHERE j.id = 'demo-job-e2e-accept'
          AND j.status::text = 'open'
          AND j.driver_id IS NULL
          AND j.truck_type::text = 'tri_axle'
          AND COALESCE(j.requires_tarp, false) = false
          AND COALESCE(j.trucks_needed, 1) >= 2
          AND NOT EXISTS (
            SELECT 1 FROM job_assignments ja
             WHERE ja.job_id = j.id
               AND ja.driver_id IN ('demo-driver', 'demo-trucking')
          )`,
    );
    if (acceptRows.length !== 1) failures.push("open accept load demo-job-e2e-accept is missing or already taken");
    const { rows: fitRows } = await pool.query(
      `SELECT id FROM trucks
        WHERE id IN ('demo-truck-driver', 'demo-truck-tc')
          AND truck_type::text = 'tri_axle'
          AND COALESCE(is_active, true) = true
          AND archived_at IS NULL
          AND COALESCE(has_tarp, false) = true`,
    );
    if (fitRows.length !== 2) failures.push("driver and trucking company are missing an active tri_axle truck");
    const { rows: openJob } = await pool.query(
      `SELECT id FROM jobs WHERE id = 'demo-job-e2e-contractor' AND contractor_id = 'demo-contractor' AND status::text = 'open'`,
    );
    if (openJob.length !== 1) failures.push("contractor open job demo-job-e2e-contractor is missing");
    const { rows: foremanJob } = await pool.query(
      `SELECT j.id
         FROM jobs j
         JOIN users f ON f.id = 'demo-foreman'
        WHERE j.id = 'demo-job-e2e-contractor'
          AND j.contractor_id = f.contractor_affiliation_id
          AND f.foreman_activated = true
          AND f.role::text = 'foreman'`,
    );
    if (foremanJob.length !== 1) failures.push("foreman cannot open the contractor job");
    const { rows: threadRows } = await pool.query(
      `SELECT job_id, COUNT(*)::int AS n
         FROM job_messages
        WHERE job_id IN ('demo-job-e2e-contractor', 'demo-job-e2e-driver-msg', 'demo-job-e2e-tc-msg')
        GROUP BY job_id`,
    );
    if (threadRows.length !== 3 || threadRows.some((r) => r.n < 2)) {
      failures.push("E2E message threads are incomplete");
    }

    if (failures.length) {
      throw new Error(`Seed assertions failed:\n  ${failures.join("\n  ")}`);
    }
    console.log("\nDemo seeded. Password is the DEMO_PASSWORD secret (not printed).");
    console.log("Login emails:");
    for (const email of LOGIN_EMAILS) console.log(`  ${email}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err.message);
    pool.end().finally(() => process.exit(1));
  });
