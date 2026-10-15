/**
 * Run with: npx tsx server/databaseUrl.test.ts
 * Checks URL precedence, the production Neon host guard, and that logs
 * never include the database password.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  databaseHost,
  formatDatabaseHostLog,
  isNeonHost,
  isProductionDatabaseEnv,
  productionDatabaseHostError,
  requireDatabaseUrl,
  resolveDatabaseUrl,
} from "./databaseUrl";

const PASSWORD = "super-secret-password";
const NEON_URL = `postgresql://neondb_owner:${PASSWORD}@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const REPLIT_URL = `postgresql://replit_user:${PASSWORD}@helium.db.replit.com/replitdb`;

if (process.argv.includes("--require-database-url")) {
  requireDatabaseUrl();
  process.exit(0);
}

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

assert.equal(databaseHost(NEON_URL), "ep-example.us-east-1.aws.neon.tech");
assert.equal(
  databaseHost("postgres://user:p%40ss@host.neon.tech:5432/db"),
  "host.neon.tech",
);
assert.equal(
  databaseHost("host=ep-keyword.neon.tech port=5432 user=neondb_owner password=secret dbname=neondb"),
  "ep-keyword.neon.tech",
);
assert.equal(databaseHost("not a url"), null);
assert.equal(databaseHost(NEON_URL)?.includes(PASSWORD), false);
assert.equal(
  databaseHost(`host=postgresql://user:${PASSWORD}@ep-keyword.neon.tech/neondb`),
  null,
);
assert.equal(
  formatDatabaseHostLog({
    host: databaseHost(`host=postgresql://user:${PASSWORD}@ep-keyword.neon.tech/neondb`),
    source: "DATABASE_URL",
  }).includes(PASSWORD),
  false,
);

assert.equal(isNeonHost("ep-example.us-east-1.aws.neon.tech"), true);
assert.equal(isNeonHost("ep-example.neon.tech"), true);
assert.equal(isNeonHost("NEON.TECH"), true);
assert.equal(isNeonHost("neon.tech."), true);
assert.equal(isNeonHost("helium.db.replit.com"), false);
assert.equal(isNeonHost("neon.tech.attacker.com"), false);
assert.equal(isNeonHost("notneon.tech"), false);
assert.equal(isNeonHost("aws.neon.tech.example.com"), false);

const shared = resolveDatabaseUrl(
  env({
    SHARED_DATABASE_URL: NEON_URL,
    EXTERNAL_DATABASE_URL: REPLIT_URL,
    NEON_DATABASE_URL: REPLIT_URL,
    DATABASE_URL: REPLIT_URL,
  }),
);
assert.equal(shared.source, "SHARED_DATABASE_URL");
assert.equal(shared.connectionString, NEON_URL);
assert.equal(shared.host, "ep-example.us-east-1.aws.neon.tech");

const external = resolveDatabaseUrl(
  env({
    SHARED_DATABASE_URL: "   ",
    EXTERNAL_DATABASE_URL: NEON_URL,
    NEON_DATABASE_URL: REPLIT_URL,
    DATABASE_URL: REPLIT_URL,
  }),
);
assert.equal(external.source, "EXTERNAL_DATABASE_URL");
assert.equal(external.host, "ep-example.us-east-1.aws.neon.tech");

const neon = resolveDatabaseUrl(
  env({
    EXTERNAL_DATABASE_URL: "",
    NEON_DATABASE_URL: NEON_URL,
    DATABASE_URL: REPLIT_URL,
  }),
);
assert.equal(neon.source, "NEON_DATABASE_URL");

const fallback = resolveDatabaseUrl(env({ DATABASE_URL: REPLIT_URL }));
assert.equal(fallback.source, "DATABASE_URL");
assert.equal(fallback.host, "helium.db.replit.com");

assert.throws(
  () => resolveDatabaseUrl(env({})),
  /SHARED_DATABASE_URL, EXTERNAL_DATABASE_URL, NEON_DATABASE_URL, or DATABASE_URL/,
);

assert.equal(isProductionDatabaseEnv(env({ NODE_ENV: "production" })), true);
assert.equal(isProductionDatabaseEnv(env({ NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" })), true);
assert.equal(isProductionDatabaseEnv(env({ NODE_ENV: "development" })), false);
assert.equal(isProductionDatabaseEnv(env({ REPLIT_DEPLOYMENT: "   " })), false);
assert.equal(isProductionDatabaseEnv(env({})), false);

const devRefusal = productionDatabaseHostError(fallback, env({ NODE_ENV: "development" }));
assert.equal(devRefusal, null);

const prodRefusal = productionDatabaseHostError(fallback, env({ NODE_ENV: "production" }));
assert.ok(prodRefusal);
assert.match(prodRefusal, /helium\.db\.replit\.com/);
assert.match(prodRefusal, /DATABASE_URL/);
assert.match(prodRefusal, /\*\.neon\.tech/);
assert.equal(prodRefusal.includes(PASSWORD), false);
assert.equal(prodRefusal.includes(REPLIT_URL), false);

const deploymentRefusal = productionDatabaseHostError(
  { host: null, source: "EXTERNAL_DATABASE_URL" },
  env({ REPLIT_DEPLOYMENT: "1" }),
);
assert.ok(deploymentRefusal);
assert.match(deploymentRefusal, /\(unparseable\)/);
assert.match(deploymentRefusal, /EXTERNAL_DATABASE_URL/);
assert.equal(deploymentRefusal.includes(PASSWORD), false);

const neonOk = productionDatabaseHostError(external, env({ NODE_ENV: "production" }));
assert.equal(neonOk, null);

const hostLog = formatDatabaseHostLog(external);
assert.equal(
  hostLog,
  "[db] database host=ep-example.us-east-1.aws.neon.tech source=EXTERNAL_DATABASE_URL",
);
assert.equal(hostLog.includes(PASSWORD), false);
assert.equal(hostLog.includes(NEON_URL), false);
assert.equal(formatDatabaseHostLog({ host: null, source: "DATABASE_URL" }).includes("password"), false);

function runRequire(extraEnv: NodeJS.ProcessEnv) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "SHARED_DATABASE_URL",
    "EXTERNAL_DATABASE_URL",
    "NEON_DATABASE_URL",
    "DATABASE_URL",
    "NODE_ENV",
    "REPLIT_DEPLOYMENT",
  ]) {
    delete childEnv[key];
  }
  Object.assign(childEnv, extraEnv);
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "server/databaseUrl.test.ts", "--require-database-url"],
    {
      cwd: process.cwd(),
      env: childEnv,
      encoding: "utf8",
    },
  );
}

const refused = runRequire({
  NODE_ENV: "production",
  DATABASE_URL: REPLIT_URL,
});
assert.equal(refused.status, 1);
assert.match(refused.stderr, /Refusing to start/);
assert.match(refused.stderr, /helium\.db\.replit\.com/);
assert.equal(refused.stderr.includes(PASSWORD), false);
assert.equal(refused.stdout.includes(PASSWORD), false);
assert.equal(refused.stderr.includes(REPLIT_URL), false);
assert.equal(refused.stdout.includes(REPLIT_URL), false);

const allowed = runRequire({
  NODE_ENV: "production",
  EXTERNAL_DATABASE_URL: NEON_URL,
  DATABASE_URL: REPLIT_URL,
});
assert.equal(allowed.status, 0, allowed.stderr);
assert.match(allowed.stdout, /database host=ep-example\.us-east-1\.aws\.neon\.tech source=EXTERNAL_DATABASE_URL/);
assert.equal(allowed.stdout.includes(PASSWORD), false);
assert.equal(allowed.stderr.includes(PASSWORD), false);

const deploymentExit = runRequire({
  NODE_ENV: "development",
  REPLIT_DEPLOYMENT: "1",
  NEON_DATABASE_URL: REPLIT_URL,
  DATABASE_URL: NEON_URL,
});
assert.equal(deploymentExit.status, 1);
assert.match(deploymentExit.stderr, /NEON_DATABASE_URL/);
assert.match(deploymentExit.stderr, /helium\.db\.replit\.com/);
assert.equal(deploymentExit.stderr.includes(PASSWORD), false);
assert.equal(deploymentExit.stdout.includes(PASSWORD), false);

console.log("databaseUrl tests passed");
