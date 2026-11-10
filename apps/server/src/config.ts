import { DEFAULT_AUTO_TAG_CONFIG, type AutoTagConfig } from '@myna/shared';

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export interface Config {
  databaseUrl: string;
  port: number;
  jwtSecret: string;
  allowDevLogin: boolean;
  exposeEmailCodes: boolean;
  googleClientIds: string[];
  appleBundleIds: string[];
  facebook: { appId: string; appSecret: string } | null;
  boardMinRatings: number;
  autoTags: AutoTagConfig;
}

/** Loads apps/server/.env into process.env if it exists (npm workspace scripts run from apps/server). */
export function loadDotEnv(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // no .env file — rely on the real environment
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (production ? '' : 'dev-only-secret-do-not-use-in-prod');
  if (production && jwtSecret.length < 32) throw new Error('JWT_SECRET must be set (≥32 chars) in production');
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://myna:myna@localhost:5432/myna',
    port: num(env.PORT, 4000),
    jwtSecret,
    allowDevLogin: !production && env.ALLOW_DEV_LOGIN === '1',
    exposeEmailCodes: !production && env.DEV_EXPOSE_EMAIL_CODES === '1',
    googleClientIds: list(env.GOOGLE_CLIENT_IDS),
    appleBundleIds: list(env.APPLE_BUNDLE_IDS),
    facebook: env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET ? { appId: env.FACEBOOK_APP_ID, appSecret: env.FACEBOOK_APP_SECRET } : null,
    boardMinRatings: num(env.BOARD_MIN_RATINGS, 50),
    autoTags: {
      newPostDays: num(env.TAG_NEW_POST_DAYS, DEFAULT_AUTO_TAG_CONFIG.newPostDays),
      potentialMinTotal: num(env.TAG_POTENTIAL_MIN_TOTAL, DEFAULT_AUTO_TAG_CONFIG.potentialMinTotal),
      potentialHighShare: num(env.TAG_POTENTIAL_HIGH_SHARE, DEFAULT_AUTO_TAG_CONFIG.potentialHighShare),
      warnMinTotal: num(env.TAG_WARN_MIN_TOTAL, DEFAULT_AUTO_TAG_CONFIG.warnMinTotal),
      warnLowShare: num(env.TAG_WARN_LOW_SHARE, DEFAULT_AUTO_TAG_CONFIG.warnLowShare),
    },
  };
}
