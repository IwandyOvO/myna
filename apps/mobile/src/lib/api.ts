import type { ApiError } from '@myna/shared';
import { Platform } from 'react-native';

/**
 * API origin. Set EXPO_PUBLIC_API_URL for devices; the Android emulator reaches
 * the host machine at 10.0.2.2.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

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
  try {
    res = await fetch(`${API_URL}${path}`, {
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
