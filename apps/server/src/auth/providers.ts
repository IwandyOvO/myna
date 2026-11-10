import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from '../config';
import { HttpError, unauthorized } from '../lib/errors';

/** What a verified third-party sign-in tells us about the user. */
export interface VerifiedIdentity {
  providerUid: string;
  email?: string;
  name?: string;
}

export interface SocialVerifier {
  google(idToken: string): Promise<VerifiedIdentity>;
  apple(identityToken: string): Promise<VerifiedIdentity>;
  facebook(accessToken: string): Promise<VerifiedIdentity>;
}

const notConfigured = (p: string) => new HttpError(501, 'provider_not_configured', `${p} sign-in is not configured`);

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Verifies tokens the mobile SDKs hand us. We never see or store third-party
 * passwords (spec §13.2) — only signed ID tokens / access tokens.
 */
export function createSocialVerifier(cfg: Config, fetchImpl: typeof fetch = fetch): SocialVerifier {
  return {
    async google(idToken) {
      if (!cfg.googleClientIds.length) throw notConfigured('Google');
      try {
        const { payload } = await jwtVerify(idToken, googleJwks, {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: cfg.googleClientIds,
        });
        return { providerUid: String(payload.sub), email: payload.email as string | undefined, name: payload.name as string | undefined };
      } catch {
        throw unauthorized('invalid_provider_token');
      }
    },
    async apple(identityToken) {
      if (!cfg.appleBundleIds.length) throw notConfigured('Apple');
      try {
        const { payload } = await jwtVerify(identityToken, appleJwks, { issuer: 'https://appleid.apple.com', audience: cfg.appleBundleIds });
        return { providerUid: String(payload.sub), email: payload.email as string | undefined };
      } catch {
        throw unauthorized('invalid_provider_token');
      }
    },
    async facebook(accessToken) {
      const fb = cfg.facebook;
      if (!fb) throw notConfigured('Facebook');
      const appToken = `${fb.appId}|${fb.appSecret}`;
      const dbg = await fetchImpl(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
      ).then((r) => r.json() as Promise<{ data?: { is_valid?: boolean; app_id?: string; user_id?: string } }>);
      if (!dbg.data?.is_valid || dbg.data.app_id !== fb.appId || !dbg.data.user_id) throw unauthorized('invalid_provider_token');
      const me = await fetchImpl(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`).then(
        (r) => r.json() as Promise<{ id?: string; name?: string; email?: string }>,
      );
      return { providerUid: dbg.data.user_id, name: me.name, email: me.email };
    },
  };
}
