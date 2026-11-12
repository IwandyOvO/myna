import * as Sentry from '@sentry/react-native';

/**
 * Crash & error reporting (Sentry project myna-cj/myna). A DSN only allows *sending* events, so it
 * is safe to ship in the app; override per build with EXPO_PUBLIC_SENTRY_DSN.
 * Privacy: no IP/personal data (sendDefaultPii off); we attach only the opaque user id.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? 'https://d286bac12f74f42e15ff4913881149ab@o4512416908574720.ingest.us.sentry.io/4512416929218560';

Sentry.init({
  dsn: DSN,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,
  // Errors only for now (free tier); turn on tracing later if needed.
  tracesSampleRate: 0,
  // EXPO_PUBLIC_SENTRY_DEBUG=1 prints what the SDK does to the Metro console.
  debug: process.env.EXPO_PUBLIC_SENTRY_DEBUG === '1',
});

export { Sentry };

export function setSentryUser(id: string | null) {
  Sentry.setUser(id ? { id } : null);
}
