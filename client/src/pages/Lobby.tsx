// The lobby answers "how do I get into a game right now?": quick match first, then friends, then open rooms.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { DEFAULT_ROOM_SETTINGS, PRESETS, PRESET_IDS, timeControlLabel, type PresetId, type RoomSettings } from '../../../shared/presets.ts';
import type { GameSummary, LeaderboardRow, LiveGame, OpenRoom, PlayerProfile, Visibility } from '../../../shared/protocol.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { EmptyState, ID_FONT, Panel, Pill, SideDot, Skeleton } from '../components/ui/controls.tsx';
import { GameRow } from '../components/GameRow.tsx';
import { Avatar } from '../components/ui/Avatar.tsx';
import { MiniBoard } from '../components/board/MiniBoard.tsx';
import { SettingsEditor } from '../components/RoomSettingsEditor.tsx';
import { request, subscribeLobby } from '../lib/socket.ts';
import { clock, MISSING, peso, plural, relativeTime, useNow } from '../lib/format.ts';
import { useApi } from '../lib/useApi.ts';
import { useTitle } from '../lib/useTitle.ts';
import { useLobby } from '../store/lobby.ts';
import { useSession } from '../store/session.ts';
import { toast } from '../store/toast.ts';

export function Lobby() {
  useTitle('Play');
  const lobby = useLobby((s) => s.lobby);
  const presence = useLobby((s) => s.presence);
  const connection = useLobby((s) => s.connection);
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    subscribeLobby(true);
    return () => subscribeLobby(false);
  }, []);

  // Arriving from the title screen's menu: open "Create a room", or start a quick match at once.
  const intent = location.state as { create?: boolean; quick?: PresetId } | null;
  useEffect(() => {
    if (!intent) return;
    if (intent.create) {
      setCreateOpen(true);
      navigate('/play', { replace: true, state: null });
    } else if (intent.quick && connection === 'online') {
      navigate('/play', { replace: true, state: null });
      void request('queue:join', { preset: intent.quick }).then((res) => {
        if (!res.ok) toast(res.message, { tone: 'negative' });
      });
    }
  }, [intent, connection, navigate]);

  return (
    <div className="column pt-6">
      <div className="mb-5">
        <h1 className="text-title">Play Scidama</h1>
        <p className="mt-1 text-body text-muted">
          {presence ? (
            <span className="num">
              {plural(presence.online, 'player')} online · {plural(lobby?.live.length ?? 0, 'game')} in play
            </span>
          ) : (
            'Math checkers where every capture is an equation in pesos or kWh.'
          )}
        </p>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <QuickMatch className="lg:col-span-2" />
        <Panel title="Play a friend" id="friend" className="flex flex-col">
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <Button variant="primary" className="w-full" onClick={() => setCreateOpen(true)}>
                Create a room
              </Button>
              <p className="mt-2 text-meta text-muted">Get an invite link. Pick the clock, the side and the rules.</p>
            </div>
            <JoinByCode />
            <p className="mt-auto text-body text-muted">
              Or practise here, unrated:{' '}
              <Link to="/play/bot" className="text-ink underline-offset-4 hover:underline">
                the bot
              </Link>{' '}
              ·{' '}
              <Link to="/play/local" className="text-ink underline-offset-4 hover:underline">
                pass and play
              </Link>
            </p>
          </div>
        </Panel>
      </div>

      <RoomsAndGames onCreate={() => setCreateOpen(true)} />

      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-2">
        <RecentGames />
        <TopPlayers />
      </div>

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- quick match

function QuickMatch({ className = '' }: { className?: string }) {
  const queue = useLobby((s) => s.queue);
  const counts = useLobby((s) => s.lobby?.queue);
  const seatCode = useLobby((s) => s.seatCode);
  const now = useNow(1000, !!queue.preset);
  const [busy, setBusy] = useState<PresetId | null>(null);

  const join = async (preset: PresetId) => {
    setBusy(preset);
    const res = await request('queue:join', { preset });
    setBusy(null);
    if (!res.ok) toast(res.message, { tone: 'negative' });
  };
  const cancel = () => void request('queue:leave');

  return (
    <Panel
      id="quick"
      title="Quick match"
      action={<span className="text-meta text-muted">Rated · paired by rating</span>}
      className={`flex flex-col ${className}`}
    >
      <div className="grid gap-2.5 sm:grid-cols-3">
        {PRESET_IDS.map((id) => {
          const p = PRESETS[id];
          const searching = queue.preset === id;
          const waiting = counts?.[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              disabled={!!seatCode || busy !== null}
              aria-pressed={searching}
              onClick={() => (searching ? cancel() : void join(id))}
              className={`flex min-h-28 flex-col items-start justify-between rounded-panel p-4 text-left transition-colors disabled:opacity-50 ${searching ? 'bg-active outline-[1.5px] -outline-offset-[1.5px] outline-accent' : 'bg-raised hover:bg-active'}`}
            >
              <span>
                <span className="block text-card font-semibold">{p.name}</span>
                <span className="num block text-body text-muted">
                  {p.gameMinutes} min · {p.moveSeconds} s a move
                </span>
              </span>
              <span className="num text-meta text-faint">
                {searching ? (
                  <span className="text-ink">Searching {clock(now - (queue.since ?? now))}</span>
                ) : waiting ? (
                  `${waiting} searching`
                ) : (
                  p.blurb
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto flex min-h-9 flex-wrap items-center justify-between gap-2 pt-3">
        {queue.preset ? (
          <>
            <p className="text-body text-muted" aria-live="polite">
              Looking for a {PRESETS[queue.preset].name.toLowerCase()} opponent near your rating. The window widens the longer you wait.
            </p>
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </>
        ) : seatCode ? (
          <p className="text-body text-muted">Finish or leave your current room to queue.</p>
        ) : (
          <p className="text-body text-muted">One click puts you in line. The game starts as soon as someone near your rating is found.</p>
        )}
      </div>
    </Panel>
  );
}

function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) return toast('Room codes have 6 characters.');
    navigate(`/room/${c}`);
  };
  return (
    <form onSubmit={submit}>
      <label htmlFor="join-code" className="mb-2 block text-body font-medium">
        Join with a code
      </label>
      <div className="flex gap-2">
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoComplete="off"
          spellCheck={false}
          placeholder="K7Q2MX"
          className={`h-11 sm:h-10 min-w-0 flex-1 rounded-input border border-control bg-ground px-3 ${ID_FONT} text-body tracking-wider text-ink uppercase placeholder:text-faint focus:border-muted focus:outline-none`}
        />
        <Button type="submit" variant="secondary" disabled={!code.trim()}>
          Join
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- open rooms and live games

function RoomsAndGames({ onCreate }: { onCreate: () => void }) {
  const lobby = useLobby((s) => s.lobby);
  const [filter, setFilter] = useState<'open' | 'live'>('open');
  const open = lobby?.open ?? [];
  const live = lobby?.live ?? [];

  return (
    <Panel title="Rooms and games" id="rooms" className="mt-3.5" action={<ButtonLink to="/watch" variant="ghost">Watch all</ButtonLink>}>
      <div className="mb-3 flex gap-2 max-sm:overflow-x-auto" role="tablist" aria-label="Filter">
        {(
          [
            ['open', 'Open rooms', open.length],
            ['live', 'Live games', live.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`flex h-[61px] min-w-36 flex-col justify-center rounded-panel px-3 text-left transition-colors ${filter === id ? 'bg-active outline-[1.5px] -outline-offset-[1.5px] outline-accent' : 'bg-raised hover:bg-active'}`}
          >
            <span className="text-meta text-muted">{label}</span>
            <span className="num text-card font-semibold">{lobby ? n : MISSING}</span>
          </button>
        ))}
      </div>
      {!lobby ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-panel" />
          ))}
        </div>
      ) : filter === 'open' ? (
        open.length ? (
          <ul className="flex flex-col">
            {open.slice(0, 8).map((r) => (
              <OpenRoomRow key={r.code} room={r} />
            ))}
          </ul>
        ) : (
          <EmptyState action={<Button onClick={onCreate}>Create a room</Button>}>
            No open rooms right now. Make one public and it shows up here.
          </EmptyState>
        )
      ) : live.length ? (
        <ul className="flex flex-col">
          {live.slice(0, 8).map((g) => (
            <LiveRow key={g.code} game={g} />
          ))}
        </ul>
      ) : (
        <EmptyState>No games in play right now.</EmptyState>
      )}
    </Panel>
  );
}

function OpenRoomRow({ room }: { room: OpenRoom }) {
  const me = useSession((s) => s.me);
  const mine = room.host.id === me?.id;
  return (
    <li className="animate-row flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
      <Avatar id={room.host.id} name={room.host.name} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          <span className="truncate">{room.host.name}</span>
          <span className="num text-meta text-faint">{room.host.rating}</span>
        </p>
        <p className="num truncate text-meta text-muted">
          {timeControlLabel(room.settings)}
          {room.settings.maxCapture ? ' · most-chips rule' : ''}
          {' · '}
          {room.joinerSide === 'random' ? 'random sides' : `you play ${room.joinerSide}`}
        </p>
      </div>
      <Pill>{room.settings.rated ? 'Rated' : 'Casual'}</Pill>
      <ButtonLink to={`/room/${room.code}`} variant={mine ? 'ghost' : 'secondary'}>
        {mine ? 'Your room' : 'Join'}
      </ButtonLink>
    </li>
  );
}

function LiveRow({ game }: { game: LiveGame }) {
  return (
    <li className="animate-row flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
      <MiniBoard code={game.board} size={44} label={`${game.red.name} against ${game.blue.name}`} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          <SideDot side="red" />
          <span className="truncate">{game.red.name}</span>
          <span className="text-faint">vs</span>
          <SideDot side="blue" />
          <span className="truncate">{game.blue.name}</span>
        </p>
        <p className="num truncate text-meta text-muted">
          {peso(game.scores.red)}–{peso(game.scores.blue)} · {game.turn} to move · {timeControlLabel(game.settings)}
          {game.spectators ? ` · ${game.spectators} watching` : ''}
        </p>
      </div>
      <ButtonLink to={`/room/${game.code}`} variant="secondary" icon="eye">
        Watch
      </ButtonLink>
    </li>
  );
}

// ---------------------------------------------------------------- history and players

function RecentGames() {
  const me = useSession((s) => s.me);
  const { data, error, loading, reload } = useApi<PlayerProfile>(me ? `/players/${me.id}` : null);
  const games = data?.recent.slice(0, 5) ?? [];
  const latest = useApi<GameSummary[]>(data && !games.length ? '/games?limit=3' : null);
  return (
    <Panel title="Your recent games" id="recent" action={me && <ButtonLink to={`/player/${me.id}`} variant="ghost">Profile</ButtonLink>}>
      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 rounded-panel" />
          ))}
        </div>
      ) : error ? (
        <EmptyState action={<Button variant="ghost" onClick={reload}>Retry</Button>}>Couldn't load your games.</EmptyState>
      ) : games.length ? (
        <ul>
          {games.map((g) => (
            <GameRow key={g.id} game={g} meId={me!.id} />
          ))}
        </ul>
      ) : (
        <>
          <EmptyState>Your finished games show up here, with replays.</EmptyState>
          {latest.data && latest.data.length > 0 && (
            <>
              <p className="mt-4 mb-1 text-meta text-muted">Just finished on Scidama</p>
              <ul>
                {latest.data.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {g.red.name} <span className="font-normal text-faint">vs</span> {g.blue.name}
                      </p>
                      <p className="num text-body text-muted">
                        {g.winner ? `${g[g.winner].name} won` : 'Draw'} · ₱{g.scores.red}–₱{g.scores.blue} · {relativeTime(g.endedAt)}
                      </p>
                    </div>
                    <Link to={`/game/${g.id}`} className="text-body text-muted hover:text-ink">
                      Replay
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function TopPlayers() {
  const { data, error, loading, reload } = useApi<LeaderboardRow[]>('/leaderboard?limit=5');
  return (
    <Panel title="Top players" id="top" action={<ButtonLink to="/leaderboard" variant="ghost">Leaderboard</ButtonLink>}>
      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 rounded-panel" />
          ))}
        </div>
      ) : error ? (
        <EmptyState action={<Button variant="ghost" onClick={reload}>Retry</Button>}>Couldn't load the leaderboard.</EmptyState>
      ) : data?.length ? (
        <ol>
          {data.map((r) => (
            <li key={r.user.id} className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0">
              <span className="num w-5 text-right text-meta text-faint">{r.rank}</span>
              <Avatar id={r.user.id} name={r.user.name} size={28} />
              <Link to={`/player/${r.user.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {r.user.name}
              </Link>
              <span className="num text-meta text-muted">
                {r.wins}W {r.losses}L {r.draws}D
              </span>
              <span className="num w-12 text-right font-semibold">{r.user.rating}</span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState>Nobody has played a rated game yet. Quick match games are rated.</EmptyState>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- create room

function CreateRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const res = await request<{ code: string }>('room:create', { visibility, settings });
    setBusy(false);
    if (!res.ok) {
      toast(res.message, { tone: 'negative' });
      if (res.error === 'already_seated' && res.code) navigate(`/room/${res.code}`);
      return;
    }
    onClose();
    navigate(`/room/${res.code}`);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create a room" description="You can change these until the game starts." width={520}>
      <SettingsEditor
        settings={settings}
        visibility={visibility}
        onChange={(patch, vis) => {
          setSettings((s) => ({ ...s, ...patch }));
          if (vis) setVisibility(vis);
        }}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" busy={busy} onClick={create}>
          Create room
        </Button>
      </div>
    </Dialog>
  );
}
