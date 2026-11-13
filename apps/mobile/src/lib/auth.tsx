import type { AuthResponse, Me } from '@myna/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, apiSession } from './api';
import { registerForPush, unregisterPush } from './push';
import { setSentryUser } from './sentry';
import { secrets } from './storage';

const TOKEN_KEY = 'myna.token';

interface AuthCtx {
  ready: boolean;
  signedIn: boolean;
  me: Me | undefined;
  signIn: (r: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const signingOut = useRef(false);
  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await unregisterPush();
    } finally {
      apiSession.setToken(null);
      await secrets.set(TOKEN_KEY, null);
      setSignedIn(false);
      // Reset (not clear) so screens on display refetch as a guest instead of spinning on removed queries.
      await qc.resetQueries();
      signingOut.current = false;
    }
  }, [qc]);

  useEffect(() => {
    apiSession.onUnauthorized(() => void signOut());
    secrets.get(TOKEN_KEY).then((t) => {
      if (t) {
        apiSession.setToken(t);
        setSignedIn(true);
      }
      setReady(true);
    });
  }, [signOut]);

  const signIn = useCallback(
    async (r: AuthResponse) => {
      apiSession.setToken(r.token);
      await secrets.set(TOKEN_KEY, r.token);
      qc.setQueryData(['me'], r.user);
      setSignedIn(true);
      // Feed/post queries carry per-viewer state (my rating, blind locks).
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
    [qc],
  );

  // Register this device for push once signed in (asks for permission the first time).
  useEffect(() => {
    if (ready && signedIn) void registerForPush();
  }, [ready, signedIn]);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('GET', '/me'), enabled: ready && signedIn });

  useEffect(() => setSentryUser(meQuery.data?.id ?? null), [meQuery.data?.id]);

  const value = useMemo(() => ({ ready, signedIn, me: meQuery.data, signIn, signOut }), [ready, signedIn, meQuery.data, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
