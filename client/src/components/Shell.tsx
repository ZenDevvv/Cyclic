// App frame: 48px top bar on the page ground, centred column, phone menu sheet, toasts, seat banner.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Mark } from './ui/Mark.tsx';
import { Avatar } from './ui/Avatar.tsx';
import { Icon } from './ui/Icon.tsx';
import { Button, IconButton } from './ui/Button.tsx';
import { useSession } from '../store/session.ts';
import { useLobby } from '../store/lobby.ts';
import { useToasts } from '../store/toast.ts';
import { onServerEvent } from '../lib/socket.ts';
import { ID_FONT } from './ui/controls.tsx';
import { SignInDialog } from './SignInDialog.tsx';

const LINKS = [
  { to: '/play', label: 'Play', end: true },
  { to: '/watch', label: 'Watch' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/learn', label: 'Learn' },
];

export function Shell() {
  const me = useSession((s) => s.me);
  const presence = useLobby((s) => s.presence);
  const connection = useLobby((s) => s.connection);
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenu(false);
    setAccount(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A quick match found a game: go there from wherever we are.
  useEffect(
    () =>
      onServerEvent((event, payload) => {
        if (event === 'queue:matched') navigate(`/room/${(payload as { code: string }).code}`);
      }),
    [navigate],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Skip to content
      </a>
      <header className={`sticky top-0 z-30 bg-ground ${scrolled ? 'border-b border-rule' : 'border-b border-transparent'}`}>
        <div className="column flex h-12 items-center gap-6">
          <Link to="/" className="flex items-center gap-2 text-card font-semibold" aria-label="Scidama home">
            <Mark />
            <span>Scidama</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `text-body font-semibold transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 text-meta text-muted sm:flex" aria-live="polite">
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${connection === 'online' ? 'bg-positive' : connection === 'connecting' ? 'bg-warning' : 'bg-negative'}`}
              />
              {connection === 'online' ? (
                <span className="num">{presence ? `${presence.online.toLocaleString('en-US')} online` : 'Online'}</span>
              ) : connection === 'connecting' ? (
                'Connecting…'
              ) : (
                'Offline, retrying'
              )}
            </span>
            {me && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccount((v) => !v)}
                  aria-expanded={account}
                  aria-haspopup="menu"
                  className="flex h-9 items-center gap-2 rounded-full pr-3 pl-1 text-body hover:bg-raised"
                >
                  <Avatar id={me.id} name={me.name} size={28} />
                  <span className="hidden max-w-36 truncate font-medium sm:inline">{me.name}</span>
                  <span className="num hidden text-muted sm:inline">{me.rating}</span>
                </button>
                {account && (
                  <AccountMenu
                    onClose={() => setAccount(false)}
                    onSignIn={() => {
                      setAccount(false);
                      setSignIn(true);
                    }}
                  />
                )}
              </div>
            )}
            <IconButton icon="menu" label="Menu" className="md:hidden" onClick={() => setMenu(true)} aria-expanded={menu} />
          </div>
        </div>
      </header>

      {menu && <PhoneMenu onClose={() => setMenu(false)} />}
      <SeatBanner />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="column mt-16 flex flex-wrap items-center justify-between gap-3 py-6 text-meta text-muted">
        <span className="flex items-center gap-2">
          <Mark size={16} /> Scidama · math checkers with units
        </span>
        <span className="flex gap-4">
          <Link to="/learn" className="hover:text-ink">
            Rules
          </Link>
          <Link to="/settings" className="hover:text-ink">
            Settings
          </Link>
          <a href="https://github.com/ZenDevvv/Cyclic" className="hover:text-ink" rel="noreferrer" target="_blank">
            Source
          </a>
        </span>
      </footer>

      <Toasts />
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}

function AccountMenu({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  const me = useSession((s) => s.me)!;
  const signOut = useSession((s) => s.signOut);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-account-menu]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [onClose]);
  const item = 'flex h-10 items-center gap-2.5 rounded-panel px-3 text-body text-muted hover:bg-raised hover:text-ink';
  return (
    <div data-account-menu role="menu" className="animate-sheet absolute right-0 top-11 z-40 w-64 rounded-card bg-surface p-2 shadow-float">
      <div className="px-3 pt-2 pb-3">
        <p className="truncate font-medium">{me.name}</p>
        <p className="num text-meta text-muted">
          Rating {me.rating} · {me.wins}W {me.losses}L {me.draws}D
        </p>
      </div>
      <Link role="menuitem" to={`/player/${me.id}`} className={item}>
        <Icon name="user" size={16} /> Your profile
      </Link>
      <Link role="menuitem" to="/settings" className={item}>
        <Icon name="settings" size={16} /> Settings
      </Link>
      {me.hasPassword ? (
        <button role="menuitem" type="button" className={`${item} w-full`} onClick={() => void signOut()}>
          <Icon name="logout" size={16} /> Sign out
        </button>
      ) : (
        <button role="menuitem" type="button" className={`${item} w-full`} onClick={onSignIn}>
          <Icon name="arrowRight" size={16} /> Sign in to another account
        </button>
      )}
    </div>
  );
}

function PhoneMenu({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Menu" className="animate-sheet fixed inset-0 z-40 flex flex-col bg-ground md:hidden">
      <div className="column flex h-12 items-center justify-between">
        <span className="flex items-center gap-2 text-card font-semibold">
          <Mark /> Scidama
        </span>
        <IconButton icon="close" label="Close menu" onClick={onClose} />
      </div>
      <nav aria-label="Main" className="column flex flex-col pt-4">
        {[...LINKS, { to: '/settings', label: 'Settings', end: false }].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `flex h-14 items-center border-b border-rule text-title ${isActive ? 'text-ink' : 'text-muted'}`}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** "You have a game in progress" when you are seated somewhere else. */
function SeatBanner() {
  const seatCode = useLobby((s) => s.seatCode);
  const location = useLocation();
  if (!seatCode || location.pathname.toUpperCase().endsWith(`/ROOM/${seatCode}`)) return null;
  return (
    <div className="column mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-raised px-4 py-2.5">
        <p className="text-body">
          You have a seat in room <span className={ID_FONT}>{seatCode}</span>.
        </p>
        <Link to={`/room/${seatCode}`} className="text-body font-semibold text-ink underline-offset-4 hover:underline">
          Return to it
        </Link>
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`animate-sheet pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-surface py-2 pr-2 pl-4 text-body shadow-float ${t.tone === 'negative' ? 'text-negative' : 'text-ink'}`}
        >
          <span>{t.text}</span>
          {t.action && (
            <Button
              variant="secondary"
              className="!h-8"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </Button>
          )}
          <IconButton icon="close" label="Dismiss" className="!size-8" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
