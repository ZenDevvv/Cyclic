// An online room: the waiting room before the game, then the game itself, then the result and rematch.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { initialBoard, other, type Side, type Step } from '../../../shared/engine.ts';
import { timeControlLabel, type RoomSettings } from '../../../shared/presets.ts';
import type { RoomSnapshot, SeatView, Visibility } from '../../../shared/protocol.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { GameLayout } from '../components/game/GameLayout.tsx';
import { PlayerStrip, type PlayerInfo } from '../components/game/PlayerStrip.tsx';
import { Ledger } from '../components/game/Ledger.tsx';
import { Chat } from '../components/game/Chat.tsx';
import { ResultDialog, resultTitle } from '../components/game/ResultDialog.tsx';
import { Button, ButtonLink, IconButton } from '../components/ui/Button.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { ID_FONT, Panel, Pill, SideDot, Skeleton, Tabs } from '../components/ui/controls.tsx';
import { SettingsEditor } from '../components/RoomSettingsEditor.tsx';
import { Avatar } from '../components/ui/Avatar.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { chatVisibility, joinRoom, request } from '../lib/socket.ts';
import { clock, copyText, plural, useNow } from '../lib/format.ts';
import { playIllegal } from '../lib/sound.ts';
import { useTitle } from '../lib/useTitle.ts';
import { resetRoom, useRoom } from '../store/room.ts';
import { useSession } from '../store/session.ts';
import { serverNow, useLobby } from '../store/lobby.ts';
import { usePrefs } from '../store/prefs.ts';
import { toast } from '../store/toast.ts';

export function Room() {
  const code = (useParams().code ?? '').toUpperCase();
  const snap = useRoom((s) => s.snap);
  const error = useRoom((s) => s.error);
  const closed = useRoom((s) => s.closed);
  const role = useRoom((s) => s.role);
  const connection = useLobby((s) => s.connection);
  useTitle(snap?.phase === 'playing' ? `Room ${code}, in play` : `Room ${code}`);

  useEffect(() => {
    resetRoom(code);
    if (connection === 'online') void joinRoom(code, 'player');
    return () => {
      // Spectators stop watching when they leave the page; players keep their seat.
      if (useRoom.getState().role === 'spectator') void request('room:leave');
      resetRoom(null);
    };
    // Joining again after a reconnect is handled by the socket module.
  }, [code]);

  useEffect(() => {
    if (connection === 'online' && !useRoom.getState().snap && !useRoom.getState().error) void joinRoom(code, 'player');
  }, [connection, code]);

  if (closed) {
    return (
      <Notice title="This room has closed" body={closed}>
        <ButtonLink to="/play" variant="primary">
          Back to the lobby
        </ButtonLink>
      </Notice>
    );
  }
  if (error) return <RoomErrorView code={code} />;
  if (!snap || snap.code !== code) return <RoomSkeleton />;
  if (snap.phase === 'waiting') return <WaitingRoom snap={snap} spectator={role === 'spectator'} />;
  return <OnlineGame snap={snap} />;
}

// ---------------------------------------------------------------- shared bits

function Notice({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="column pt-10">
      <div className="max-w-xl rounded-card bg-surface p-5.5">
        <h1 className="text-title">{title}</h1>
        <p className="mt-2 text-body text-muted">{body}</p>
        {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

function RoomErrorView({ code }: { code: string }) {
  const error = useRoom((s) => s.error)!;
  if (error.code === 'already_seated' && error.roomCode) {
    return (
      <Notice title="You're already in a game" body={`${error.message} You can watch room ${code} instead.`}>
        <ButtonLink to={`/room/${error.roomCode}`} variant="primary">
          Return to your game
        </ButtonLink>
        <Button
          onClick={() => {
            useRoom.setState({ error: null });
            void joinRoom(code, 'spectator');
          }}
        >
          Watch this room
        </Button>
      </Notice>
    );
  }
  const title = error.code === 'not_found' ? 'Room not found' : error.code === 'room_full' ? 'This room is full' : "Can't open this room";
  return (
    <Notice title={title} body={error.message}>
      <ButtonLink to="/play" variant="primary">
        Back to the lobby
      </ButtonLink>
    </Notice>
  );
}

function RoomSkeleton() {
  return (
    <div className="column pt-6" aria-busy="true" aria-label="Loading room">
      <Skeleton className="h-7 w-48" />
      <div className="mt-5 grid gap-3.5 lg:grid-cols-[minmax(0,600px)_384px]">
        <Skeleton className="aspect-square w-full rounded-board" />
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-16 rounded-panel" />
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-16 rounded-panel" />
        </div>
      </div>
    </div>
  );
}

function mySideIn(snap: RoomSnapshot, myId: string | undefined): Side | null {
  if (!myId) return null;
  if (snap.seats.red?.user.id === myId) return 'red';
  if (snap.seats.blue?.user.id === myId) return 'blue';
  return null;
}

const seatInfo = (seat: SeatView | null, myId: string | undefined, hostId: string): PlayerInfo | null =>
  seat
    ? {
        id: seat.user.id,
        name: seat.user.name,
        rating: seat.user.rating,
        connected: seat.connected,
        forfeitAt: seat.forfeitAt,
        tag: seat.user.id === myId ? 'You' : seat.user.id === hostId ? 'Host' : undefined,
      }
    : null;

async function act(event: Parameters<typeof request>[0], ...args: unknown[]): Promise<boolean> {
  const res = await request(event, ...args);
  if (!res.ok) toast(res.message, { tone: 'negative' });
  return res.ok;
}

function InviteLink({ code }: { code: string }) {
  const url = `${location.origin}/room/${code}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 rounded-input bg-ground py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-body text-muted">{url}</span>
        <Button
          icon="link"
          variant="secondary"
          className="!h-9"
          onClick={async () => toast((await copyText(url)) ? 'Invite link copied.' : 'Copy failed. Select the link instead.')}
        >
          Copy link
        </Button>
      </div>
      <p className="text-meta text-muted">
        Or share the code{' '}
        <button
          type="button"
          className={`${ID_FONT} text-body text-ink hover:underline`}
          onClick={async () => toast((await copyText(code)) ? 'Room code copied.' : 'Copy failed.')}
          aria-label={`Copy room code ${code}`}
        >
          {code}
        </button>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- waiting room

function WaitingRoom({ snap, spectator }: { snap: RoomSnapshot; spectator: boolean }) {
  const me = useSession((s) => s.me);
  const chat = useRoom((s) => s.chat);
  const navigate = useNavigate();
  const isHost = me?.id === snap.hostId;
  const mySide = mySideIn(snap, me?.id);
  const ready = !!snap.seats.red && !!snap.seats.blue;
  const [busy, setBusy] = useState(false);

  const update = (settings: Partial<RoomSettings>, visibility?: Visibility) => void act('room:settings', { settings, visibility });

  const leave = async () => {
    await act('room:leave');
    navigate('/play');
  };

  return (
    <div className="column pt-6 pb-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title">
            Room <span className={ID_FONT}>{snap.code}</span>
          </h1>
          <Pill>{snap.visibility === 'private' ? 'Private' : 'Public'}</Pill>
          <Pill>{snap.settings.rated ? 'Rated' : 'Casual'}</Pill>
        </div>
        <Button variant="ghost" icon="logout" onClick={leave}>
          {spectator ? 'Stop watching' : 'Leave room'}
        </Button>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5">
          <Board board={initialBoard()} orientation={mySide ?? 'red'} label="Starting position" />
          <p className="text-meta text-muted">
            Starting position. Red moves first; the operator under a capture's landing square sets its score.{' '}
            <Link to="/learn" className="text-ink underline-offset-4 hover:underline">
              Rules
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <Panel title="Players">
            <div className="flex flex-col gap-2">
              {(['red', 'blue'] as const).map((side) => (
                <SeatRow key={side} side={side} seat={snap.seats[side]} hostId={snap.hostId} myId={me?.id} randomSides={snap.settings.hostSide === 'random'} />
              ))}
            </div>
            {snap.settings.hostSide === 'random' && <p className="mt-3 text-meta text-muted">Sides are drawn when the game starts.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isHost ? (
                <Button
                  variant="primary"
                  disabled={!ready}
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    await act('room:start');
                    setBusy(false);
                  }}
                >
                  Start game
                </Button>
              ) : null}
              <p className="text-body text-muted">
                {!ready
                  ? 'Waiting for an opponent to join.'
                  : isHost
                    ? 'Both seats are taken.'
                    : spectator
                      ? 'Waiting for the host to start.'
                      : `Waiting for ${snap.seats[mySide ? other(mySide) : 'red']?.user.name ?? 'the host'} to start.`}
              </p>
            </div>
          </Panel>

          {!ready && (
            <Panel title="Invite a friend">
              <InviteLink code={snap.code} />
            </Panel>
          )}

          <Panel title="Settings" action={!isHost && <span className="text-meta text-muted">Set by the host</span>}>
            {isHost ? (
              <SettingsEditor settings={snap.settings} visibility={snap.visibility} onChange={update} />
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
                <dt className="text-muted">Clock</dt>
                <dd>{timeControlLabel(snap.settings)}</dd>
                <dt className="text-muted">Capturing</dt>
                <dd>{snap.settings.maxCapture ? 'Must take the most chips' : 'Any capture'}</dd>
                <dt className="text-muted">Spectators</dt>
                <dd>{snap.settings.allowSpectators ? 'Allowed' : 'Not allowed'}</dd>
              </dl>
            )}
          </Panel>

          <Panel title="Chat" className="flex h-72 flex-col">
            <Chat messages={chat} canSend className="min-h-0 flex-1" />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SeatRow({ side, seat, hostId, myId, randomSides }: { side: Side; seat: SeatView | null; hostId: string; myId?: string; randomSides: boolean }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-panel bg-raised px-3 py-2">
      {seat ? <Avatar id={seat.user.id} name={seat.user.name} size={32} /> : <span className="size-8 flex-none rounded-full border border-dashed border-control" />}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          {!randomSides && <SideDot side={side} />}
          {seat ? (
            <Link to={`/player/${seat.user.id}`} className="truncate hover:underline">
              {seat.user.name}
            </Link>
          ) : (
            <span className="text-muted">Open seat</span>
          )}
          {seat && <span className="num text-meta text-faint">{seat.user.rating}</span>}
        </p>
        <p className="text-meta text-muted">
          {seat
            ? [seat.user.id === myId && 'You', seat.user.id === hostId && 'Host', !seat.connected && 'Away'].filter(Boolean).join(' · ') || (randomSides ? 'Seated' : side === 'red' ? 'Red, moves first' : 'Blue')
            : randomSides
              ? 'Waiting for a player'
              : side === 'red'
                ? 'Red, moves first'
                : 'Blue'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the game

function OnlineGame({ snap }: { snap: RoomSnapshot }) {
  const me = useSession((s) => s.me);
  const records = useRoom((s) => s.records);
  const chat = useRoom((s) => s.chat);
  const unread = useRoom((s) => s.unread);
  const confirmResign = usePrefs((s) => s.confirmResign);
  const navigate = useNavigate();
  const game = snap.game!;
  const state = game.state;
  const mySide = mySideIn(snap, me?.id);
  const playing = snap.phase === 'playing';
  const [tab, setTab] = useState<'ledger' | 'chat'>('ledger');
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  useNow(250, playing); // re-render the clocks
  const sNow = serverNow();

  useEffect(() => {
    chatVisibility.visible = tab === 'chat';
    if (tab === 'chat') useRoom.setState({ unread: 0 });
    return () => {
      chatVisibility.visible = false;
    };
  }, [tab, chat.length]);

  // Open the result once per finished game.
  const shownFor = useRef<string | null>(null);
  const resultKey = state.result && snap.phase === 'ended' ? `${snap.code}-${game.savedId ?? state.stepCount}-${state.result.reason}` : null;
  useEffect(() => {
    if (!resultKey || resultKey === shownFor.current) return;
    shownFor.current = resultKey;
    const t = setTimeout(() => setResultOpen(true), 600);
    return () => clearTimeout(t);
  }, [resultKey]);
  // A rematch starts a new game: close the old result.
  useEffect(() => {
    if (playing) setResultOpen(false);
  }, [playing]);

  const orientation: Side = flipped ? other(mySide ?? 'red') : mySide ?? 'red';
  const players: Record<Side, PlayerInfo | null> = {
    red: seatInfo(snap.seats.red, me?.id, snap.hostId),
    blue: seatInfo(snap.seats.blue, me?.id, snap.hostId),
  };
  const last = game.lastStep;
  const mark: BoardMark | null = last ? { from: last.from, to: last.to, captureSquare: last.captureSquare, captured: last.captured, key: last.index } : null;
  const moveLeft = game.clock.moveEndsAt ? game.clock.moveEndsAt - sNow : null;
  const gameLeft = game.clock.gameEndsAt ? game.clock.gameEndsAt - sNow : null;

  const onStep = async (step: Step) => {
    setPending(true);
    const res = await request('game:step', step);
    setPending(false);
    if (!res.ok) {
      playIllegal();
      toast(res.message, { tone: 'negative' });
      void request('room:sync');
    }
  };

  const strip = (side: Side) => (
    <PlayerStrip
      side={side}
      player={players[side]}
      score={state.scores[side]}
      toMove={state.turn === side}
      moveLeft={moveLeft}
      moveSeconds={snap.settings.moveSeconds}
      now={sNow}
      over={!playing}
    />
  );

  const opponent = mySide ? players[other(mySide)] : null;
  const offerFromOpponent = playing && mySide && game.drawOfferBy === other(mySide);
  const myOffer = playing && mySide && game.drawOfferBy === mySide;
  const rematchFromOpponent = !playing && mySide && game.rematch[other(mySide)] && !game.rematch[mySide];

  let banner: ReactNode = null;
  if (offerFromOpponent) {
    banner = (
      <Banner text={`${opponent?.name ?? 'Your opponent'} offers a draw.`}>
        <Button variant="ghost" onClick={() => void act('game:draw-answer', { accept: false })}>
          Decline
        </Button>
        <Button variant="primary" onClick={() => void act('game:draw-answer', { accept: true })}>
          Accept draw
        </Button>
      </Banner>
    );
  } else if (rematchFromOpponent) {
    banner = (
      <Banner text={`${opponent?.name ?? 'Your opponent'} wants a rematch.`}>
        <Button variant="primary" onClick={() => void act('game:rematch', { want: true })}>
          Play again
        </Button>
      </Banner>
    );
  } else if (myOffer) {
    banner = <Banner text="Draw offered. Waiting for an answer." />;
  } else if (!mySide) {
    banner = <Banner text={`You're watching${snap.spectators.length > 1 ? ` with ${plural(snap.spectators.length - 1, 'other')}` : ''}.`} />;
  }

  return (
    <>
      <GameLayout
        header={
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="min-w-0 truncate text-title">
              {players.red?.name ?? 'Red'} <span className="text-faint">vs</span> {players.blue?.name ?? 'Blue'}
            </h1>
            <p className="num text-meta text-muted">
              {snap.mode === 'quick' ? 'Quick match' : 'Room'} <span className={ID_FONT}>{snap.code}</span> · {snap.settings.rated ? 'Rated' : 'Casual'}
              {snap.spectators.length ? ` · ${plural(snap.spectators.length, 'spectator')}` : ''}
            </p>
          </div>
        }
        board={
          <Board
            board={state.board}
            state={state}
            orientation={orientation}
            interactive={!!mySide && playing && state.turn === mySide && !pending}
            onStep={onStep}
            onIllegal={playIllegal}
            last={mark}
            label={`Board, ${state.turn} to move`}
          />
        }
        top={strip(other(orientation))}
        bottom={strip(orientation)}
        banner={banner}
        panel={
          <>
            <div className="flex items-center justify-between gap-3 px-5.5 pt-2">
              <Tabs
                label="Game panel"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'ledger', label: 'Ledger' },
                  {
                    value: 'chat',
                    label: (
                      <>
                        Chat{unread > 0 && <span className="num rounded-full bg-ink px-1.5 text-meta text-black">{unread}</span>}
                      </>
                    ),
                  },
                ]}
              />
              <span className="num flex items-center gap-1.5 text-meta text-muted" title="Game clock">
                <Icon name="clock" size={14} />
                {gameLeft !== null ? (playing ? clock(gameLeft) : 'Stopped') : 'No game clock'}
              </span>
            </div>
            {tab === 'ledger' ? (
              <>
                <p className="px-5.5 pt-2 text-meta text-muted">
                  {state.result
                    ? `${resultTitle(state.result, players, mySide)} · ₱${state.result.final.red}–₱${state.result.final.blue}`
                    : `Turn ${state.turnNumber} · ${timeControlLabel(snap.settings)}`}
                </p>
                <Ledger records={records} className="mt-1 min-h-0 flex-1 px-5.5 pt-1 pb-3" />
              </>
            ) : (
              <Chat messages={chat} canSend className="min-h-0 flex-1 px-5.5 pb-4" />
            )}
          </>
        }
        actions={
          <>
            {playing && mySide && (
              <>
                <Button icon="handshake" variant="ghost" disabled={!!game.drawOfferBy} onClick={() => void act('game:draw-offer')}>
                  Offer draw
                </Button>
                <Button icon="flag" variant="ghost" onClick={() => (confirmResign ? setResignOpen(true) : void act('game:resign'))}>
                  Resign
                </Button>
              </>
            )}
            {!playing && mySide && snap.seats[other(mySide)] && (
              <Button variant="primary" disabled={game.rematch[mySide]} onClick={() => void act('game:rematch', { want: true })}>
                {game.rematch[mySide] ? 'Rematch asked' : 'Rematch'}
              </Button>
            )}
            {!playing && (
              <Button variant="ghost" onClick={() => setResultOpen(true)}>
                Result
              </Button>
            )}
            {!playing && game.savedId && (
              <ButtonLink variant="ghost" to={`/game/${game.savedId}`}>
                Replay
              </ButtonLink>
            )}
            <span className="flex-1" />
            {(!playing || !mySide) && (
              <Button
                variant="ghost"
                icon="logout"
                onClick={async () => {
                  await act('room:leave');
                  navigate('/play');
                }}
              >
                Leave
              </Button>
            )}
            <IconButton icon="flip" label="Flip board" onClick={() => setFlipped((f) => !f)} />
          </>
        }
      />

      <Dialog open={resignOpen} onClose={() => setResignOpen(false)} title="Resign this game?" description="Your opponent wins. Rated games count as a loss.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setResignOpen(false)}>
            Keep playing
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setResignOpen(false);
              await act('game:resign');
            }}
          >
            Resign
          </Button>
        </div>
      </Dialog>

      {state.result && (
        <ResultDialog
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          result={state.result}
          captures={state.scores}
          players={players}
          mySide={mySide}
          ratingChange={game.ratingChange}
        >
          {game.savedId && (
            <ButtonLink variant="ghost" to={`/game/${game.savedId}`}>
              Replay
            </ButtonLink>
          )}
          <ButtonLink variant="ghost" to="/play">
            Lobby
          </ButtonLink>
          {mySide && snap.seats[other(mySide)] && (
            <Button variant="primary" disabled={game.rematch[mySide]} onClick={() => void act('game:rematch', { want: true })}>
              {game.rematch[mySide] ? 'Waiting for opponent' : 'Rematch'}
            </Button>
          )}
        </ResultDialog>
      )}
    </>
  );
}

function Banner({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel bg-raised px-4 py-2.5" role="status">
      <p className="text-body">{text}</p>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

