// Who is playing on this device: a persistent guest by default, or a signed-in account.
import { create } from 'zustand';
import type { Me, SessionResponse } from '../../../shared/protocol.ts';
import { api, ApiError, getToken, setToken } from '../lib/api.ts';

interface SessionStore {
  status: 'loading' | 'ready' | 'error';
  me: Me | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  adopt: (session: SessionResponse) => void;
  setMe: (me: Me) => void;
  signOut: () => Promise<void>;
}

/** Listeners that must react to a new token (the socket). */
const tokenListeners = new Set<(token: string) => void>();
export const onTokenChange = (fn: (token: string) => void) => {
  tokenListeners.add(fn);
  return () => tokenListeners.delete(fn);
};

async function newGuest(): Promise<SessionResponse> {
  return api<SessionResponse>('/guest', { method: 'POST' });
}

export const useSession = create<SessionStore>((set, get) => ({
  status: 'loading',
  me: null,
  error: null,

  bootstrap: async () => {
    set({ status: 'loading', error: null });
    try {
      let me: Me | null = null;
      if (getToken()) {
        try {
          me = await api<Me>('/me');
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401) throw err;
        }
      }
      if (!me) {
        const s = await newGuest();
        setToken(s.token);
        me = s.me;
      }
      set({ status: 'ready', me });
      tokenListeners.forEach((fn) => fn(getToken()!));
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Could not start a session.' });
    }
  },

  refresh: async () => {
    try {
      set({ me: await api<Me>('/me') });
    } catch {
      // Keep the last known profile; the next action will surface any error.
    }
  },

  adopt: (session) => {
    setToken(session.token);
    set({ me: session.me, status: 'ready' });
    tokenListeners.forEach((fn) => fn(session.token));
  },

  setMe: (me) => set({ me }),

  signOut: async () => {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      // The token is dropped locally either way.
    }
    setToken(null);
    await get().bootstrap();
  },
}));
