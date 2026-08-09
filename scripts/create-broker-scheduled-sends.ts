import { pool } from "../server/db";

async function main() {
  // Create the table with all columns if it doesn't exist yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_scheduled_sends (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      broker_id text NOT NULL,
      date date NOT NULL,
      send_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      sent_jobs integer,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      tz_offset_min integer NOT NULL DEFAULT 0,
      attempts integer NOT NULL DEFAULT 0
    )
  `);

  // Idempotent backfills for tables created by an earlier version of this
  // script that was missing tz_offset_min and attempts.
  await pool.query(`
    ALTER TABLE broker_scheduled_sends
      ADD COLUMN IF NOT EXISTS tz_offset_min integer NOT NULL DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE broker_scheduled_sends
      ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bss_pending ON broker_scheduled_sends (status, send_at)`);
  console.log("broker_scheduled_sends ready");
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
