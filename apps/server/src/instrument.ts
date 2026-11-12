/**
 * Sentry error reporting for the API (project myna-cj/myna-api). Imported first by src/index.ts.
 * The DSN only allows sending events; override with SENTRY_DSN, or set SENTRY_DSN=off to disable.
 * Disabled under tests. No request bodies, IPs or other personal data are sent.
 */
import * as Sentry from '@sentry/node';
import { loadDotEnv } from './config';

loadDotEnv();
const DSN = process.env.SENTRY_DSN ?? 'https://bf50ec71ad17c81df04f1477d13b98ad@o4512416908574720.ingest.us.sentry.io/4512416943570944';

if (process.env.NODE_ENV !== 'test' && DSN !== 'off') {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    // Privacy: collect nothing personal — no user info/IPs, cookies, headers (auth tokens), bodies, query strings or SQL values.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false },
    tracesSampleRate: 0, // errors only for now
  });
}
