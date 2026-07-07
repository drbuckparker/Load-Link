import { fetch as expoFetch } from "expo/fetch";
import { QueryClient, QueryFunction, focusManager } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus, Platform } from "react-native";

const nativeFetch = globalThis.fetch;
const safeFetch = Platform.OS === 'web' ? nativeFetch : expoFetch;

let _authToken: string | null = null;
let _reloginInProgress: Promise<boolean> | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

const PRODUCTION_DOMAIN = "loadlinkmobile.replit.app";

export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN || PRODUCTION_DOMAIN;

  const url = new URL(`https://${host}`);

  return url.href;
}

async function attemptSilentRelogin(): Promise<boolean> {
  if (_reloginInProgress) return _reloginInProgress;
  _reloginInProgress = (async () => {
    try {
      const email = await AsyncStorage.getItem('loadlink_email');
      const password = await AsyncStorage.getItem('loadlink_password');
      if (!email) return false;

      const baseUrl = getApiUrl();
      const body: any = { email };
      if (password) body.password = password;

      const res = await safeFetch(new URL('/api/auth/login', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          _authToken = data.token;
          await AsyncStorage.setItem('loadlink_token', data.token);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      _reloginInProgress = null;
    }
  })();
  return _reloginInProgress;
}

function getHeaders(includeContent?: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContent) {
    headers["Content-Type"] = "application/json";
  }
  if (_authToken) {
    headers["Authorization"] = `Bearer ${_authToken}`;
  }
  // Tell the server the user's local timezone (minutes offset from UTC, as
  // returned by Date.getTimezoneOffset) so day-based views like the dashboard
  // compute "today" in the user's local time, not the server's UTC clock.
  try {
    headers["X-TZ-Offset"] = String(new Date().getTimezoneOffset());
  } catch {}
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
      else if (json.error) {
        message = json.error;
        if (json.details && Array.isArray(json.details)) {
          const fields = json.details.map((d: any) => d.path?.join('.') || d.message).filter(Boolean);
          if (fields.length) message += ': ' + fields.join(', ');
        }
      }
    } catch {}
    if (message.includes('<!DOCTYPE') || message.includes('<html') || message.includes('<head')) {
      message = 'The LoadLink service is temporarily unavailable. Please try again.';
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  let res = await safeFetch(url.toString(), {
    method,
    headers: getHeaders(!!data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && !route.includes('/api/auth/')) {
    const reloginOk = await attemptSilentRelogin();
    if (reloginOk) {
      res = await safeFetch(url.toString(), {
        method,
        headers: getHeaders(!!data),
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    let res = await safeFetch(url.toString(), {
      headers: getHeaders(),
      credentials: "include",
    });

    if (res.status === 401) {
      const reloginOk = await attemptSilentRelogin();
      if (reloginOk) {
        res = await safeFetch(url.toString(), {
          headers: getHeaders(),
          credentials: "include",
        });
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: 60000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 30000,
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
}
