/**
 * Resolve the Postgres URL for the companion server.
 *
 * Replit injects DATABASE_URL for its built-in database and will not let that
 * secret be replaced. The shared production Neon database is stored in
 * EXTERNAL_DATABASE_URL (SHARED_DATABASE_URL wins when set explicitly).
 * Prefer those over NEON_DATABASE_URL, and only then fall back to DATABASE_URL.
 *
 * Never log the connection string. It contains the database password.
 */

export const DATABASE_URL_CANDIDATES = [
  "SHARED_DATABASE_URL",
  "EXTERNAL_DATABASE_URL",
  "NEON_DATABASE_URL",
  "DATABASE_URL",
] as const;

export type DatabaseUrlSource = (typeof DATABASE_URL_CANDIDATES)[number];

export interface ResolvedDatabaseUrl {
  /** Full connection string. Do not log, print, or include this in errors. */
  connectionString: string;
  source: DatabaseUrlSource;
  /** Hostname only, or null when the string has no readable host. */
  host: string | null;
}

export function isProductionDatabaseEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  const deployment = env.REPLIT_DEPLOYMENT;
  return typeof deployment === "string" && deployment.trim() !== "";
}

export function isNeonHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  return normalized === "neon.tech" || normalized.endsWith(".neon.tech");
}

export function databaseHost(connectionString: string): string | null {
  const trimmed = connectionString.trim();
  if (!trimmed) return null;

  const fromUrl = hostFromUrl(trimmed);
  if (fromUrl) return sanitizeHost(fromUrl);

  const fromKeyword = hostFromKeywordForm(trimmed);
  if (fromKeyword) return sanitizeHost(fromKeyword);

  return null;
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): ResolvedDatabaseUrl {
  for (const source of DATABASE_URL_CANDIDATES) {
    const raw = env[source];
    if (typeof raw !== "string") continue;
    const connectionString = raw.trim();
    if (!connectionString) continue;
    return {
      connectionString,
      source,
      host: databaseHost(connectionString),
    };
  }

  throw new Error(
    "No database URL is set. Set SHARED_DATABASE_URL, EXTERNAL_DATABASE_URL, NEON_DATABASE_URL, or DATABASE_URL (first non-empty value wins).",
  );
}

export function formatDatabaseHostLog(
  resolved: Pick<ResolvedDatabaseUrl, "host" | "source">,
): string {
  const host = resolved.host ?? "(unparseable)";
  return `[db] database host=${host} source=${resolved.source}`;
}

/**
 * Clear error when production is pointed at something other than Neon.
 * Returns null when the process may continue. The message never includes
 * the connection string or password.
 */
export function productionDatabaseHostError(
  resolved: Pick<ResolvedDatabaseUrl, "host" | "source">,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isProductionDatabaseEnv(env)) return null;
  if (resolved.host !== null && isNeonHost(resolved.host)) return null;

  const host = resolved.host ?? "(unparseable)";
  return (
    `Refusing to start: database host "${host}" from ${resolved.source} is not a *.neon.tech host. ` +
    "Production (NODE_ENV=production or REPLIT_DEPLOYMENT) must use the shared Neon database, not Replit's built-in database. " +
    "Set SHARED_DATABASE_URL or EXTERNAL_DATABASE_URL to that Neon connection string. " +
    "The password and connection string were not logged."
  );
}

let loggedDatabaseKey: string | null = null;

export function logDatabaseHost(resolved: Pick<ResolvedDatabaseUrl, "host" | "source">): void {
  const key = `${resolved.source}\0${resolved.host ?? ""}`;
  if (loggedDatabaseKey === key) return;
  loggedDatabaseKey = key;
  console.log(formatDatabaseHostLog(resolved));
}

/**
 * Resolve the URL, log only the host, and in production exit if that host
 * is not *.neon.tech.
 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): ResolvedDatabaseUrl {
  const resolved = resolveDatabaseUrl(env);
  const refusal = productionDatabaseHostError(resolved, env);
  if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
  }
  logDatabaseHost(resolved);
  return resolved;
}

function hostFromUrl(connectionString: string): string | null {
  try {
    const hostname = new URL(connectionString).hostname;
    if (!hostname) return null;
    return hostname;
  } catch {
    return null;
  }
}

function hostFromKeywordForm(connectionString: string): string | null {
  const match = /(?:^|[\s])host\s*=\s*('[^']*'|"[^"]*"|[^\s]+)/i.exec(connectionString);
  if (!match) return null;

  let value = match[1];
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1);
  }
  if (!value) return null;

  return stripHostPort(value);
}

/** Drop a parsed host that still contains credentials or a URL. */
function sanitizeHost(host: string): string | null {
  const value = host.trim();
  if (!value) return null;
  if (
    value.includes("://") ||
    value.includes("@") ||
    value.includes("/") ||
    value.includes("\\") ||
    /\s/.test(value)
  ) {
    return null;
  }
  return value;
}

function stripHostPort(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) return host.slice(1, end);
  }
  const colon = host.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(host.slice(colon + 1))) {
    return host.slice(0, colon);
  }
  return host;
}
