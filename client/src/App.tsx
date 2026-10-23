import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { Shell } from './components/Shell.tsx';
import { useSession } from './store/session.ts';
import { usePrefs } from './store/prefs.ts';
import { startSocket } from './lib/socket.ts';
import { Button } from './components/ui/Button.tsx';
import { PageSkeleton } from './components/PageSkeleton.tsx';
import { Lobby } from './pages/Lobby.tsx';
import { Room } from './pages/Room.tsx';
import { LocalGame } from './pages/LocalGame.tsx';
import Title from './pages/Title.tsx';

const Watch = lazy(() => import('./pages/Watch.tsx'));
const Profile = lazy(() => import('./pages/Profile.tsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.tsx'));
const Replay = lazy(() => import('./pages/Replay.tsx'));
const Learn = lazy(() => import('./pages/Learn.tsx'));
const Settings = lazy(() => import('./pages/Settings.tsx'));
const NotFound = lazy(() => import('./pages/NotFound.tsx'));

export function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  const motion = usePrefs((s) => s.motion);

  useEffect(() => {
    void bootstrap().then(startSocket);
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
  }, [motion]);

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Title />} />
        <Route path="play" element={<Online><Lobby /></Online>} />
        <Route path="room/:code" element={<Online><Room /></Online>} />
        <Route path="watch" element={<Online><Watch /></Online>} />
        <Route path="player/:id" element={<Online><Profile /></Online>} />
        <Route path="leaderboard" element={<Online><Leaderboard /></Online>} />
        <Route path="game/:id" element={<Online><Replay /></Online>} />
        <Route path="settings" element={<Online><Settings /></Online>} />
        <Route path="play/bot" element={<LocalGame mode="bot" />} />
        <Route path="play/local" element={<LocalGame mode="local" />} />
        <Route path="learn" element={<Lazy><Learn /></Lazy>} />
        <Route path="*" element={<Lazy><NotFound /></Lazy>} />
      </Route>
    </Routes>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

/** Pages that need a session and the server. */
function Online({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const bootstrap = useSession((s) => s.bootstrap);
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') {
    return (
      <div className="column pt-10">
        <div className="max-w-xl rounded-card bg-surface p-5.5">
          <h1 className="text-title">Can't reach the game server</h1>
          <p className="mt-2 text-body text-muted">{error}</p>
          <p className="mt-1 text-body text-muted">You can still play the bot or pass-and-play on this device.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon="refresh" onClick={() => void bootstrap().then(startSocket)}>
              Try again
            </Button>
            <a className="inline-flex h-11 sm:h-9 items-center rounded-full bg-raised px-4 text-body font-medium hover:bg-active" href="/play/bot">
              Play the bot
            </a>
          </div>
        </div>
      </div>
    );
  }
  return <Lazy>{children}</Lazy>;
}
