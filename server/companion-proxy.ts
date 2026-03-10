import type { Request, Response } from "express";

const COMPANION_API_URL = process.env.COMPANION_API_URL || "";
const COMPANION_API_KEY = process.env.COMPANION_API_KEY || "";

if (!COMPANION_API_URL) {
  console.warn("COMPANION_API_URL is not set - proxy will not work");
}
if (!COMPANION_API_KEY) {
  console.warn("COMPANION_API_KEY is not set - proxy will not work");
}

const sessionCookieCache = new Map<string, string>();

function buildSessionCookie(sessionToken: string): string {
  const cached = sessionCookieCache.get(sessionToken);
  if (cached) return cached;
  return `loadlink.sid=${sessionToken}`;
}

export async function companionFetch(
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<globalThis.Response> {
  const url = `${COMPANION_API_URL}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": COMPANION_API_KEY,
    ...options.headers,
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

export async function proxyRequest(req: Request, res: Response) {
  try {
    const path = req.originalUrl;
    const headers: Record<string, string> = {
      "X-API-Key": COMPANION_API_KEY,
    };

    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        headers["Cookie"] = buildSessionCookie(token);
        headers["Authorization"] = authHeader;
      }
    }

    if (req.body && Object.keys(req.body).length > 0) {
      headers["Content-Type"] = "application/json";
    }

    const url = `${COMPANION_API_URL}${path}`;

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      redirect: "manual",
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);

    res.status(response.status);

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const text = await response.text();

    try {
      const json = JSON.parse(text);
      return res.json(json);
    } catch {
      return res.send(text);
    }
  } catch (err: any) {
    console.error("Proxy error:", err.message);
    return res.status(502).json({ message: "Unable to reach the web app server. Please try again." });
  }
}

export async function companionLogin(email: string, password: string) {
  const response = await companionFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Login failed" }));
    throw new Error(data.message || data.error || "Login failed");
  }

  const data = await response.json();

  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  let signedCookie = "";
  for (const c of cookies) {
    if (c.startsWith("loadlink.sid=")) {
      signedCookie = c.split(";")[0];
      break;
    }
  }

  const sessionToken = data.sessionToken || data.token;

  if (signedCookie && sessionToken) {
    sessionCookieCache.set(sessionToken, signedCookie);
  }

  return {
    token: sessionToken,
    user: data.user,
  };
}
