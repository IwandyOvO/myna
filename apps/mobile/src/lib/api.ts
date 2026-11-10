import type { ApiError } from '@myna/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API origin, resolved in this order:
 * 1. EXPO_PUBLIC_API_URL (apps/mobile/.env), unless it points at localhost while running on a phone;
 * 2. in development on a device, the computer that serves the JS bundle (Expo's hostUri) on port 4000;
 * 3. localhost (web, iOS simulator) / 10.0.2.2 (Android emulator).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const isLocal = (u: string) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  const lanHost = host && /^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.startsWith('127.') ? host : null;
  if (configured && !(Platform.OS !== 'web' && isLocal(configured) && lanHost)) return configured;
  if (Platform.OS !== 'web' && lanHost) return `http://${lanHost}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

/** Requests that take longer than this fail with `network_error` instead of spinning forever. */
const TIMEOUT_MS = 10_000;

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let token: string | null = null;
let locale = 'en';
let onUnauthorized: (() => void) | null = null;

export const apiSession = {
  setToken(t: string | null) {
    token = t;
  },
  setLocale(l: string) {
    locale = l;
  },
  onUnauthorized(fn: () => void) {
    onUnauthorized = fn;
  },
  get hasToken() {
    return token !== null;
  },
};

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'accept-language': locale,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    if (res.status === 401 && token && (data.error === 'invalid_token' || data.error === 'user_not_found')) onUnauthorized?.();
    throw new ApiFailure(res.status, data.error ?? 'unknown');
  }
  return data;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
