import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { decodeBoard } from '../../../shared/codec.ts';
import { initialBoard } from '../../../shared/engine.ts';
import { timeControlLabel } from '../../../shared/presets.ts';
import type { LiveGame } from '../../../shared/protocol.ts';
import { Board } from '../components/board/Board.tsx';
import { ButtonLink } from '../components/ui/Button.tsx';
import { EmptyState, SideDot, Skeleton } from '../components/ui/controls.tsx';
import { subscribeLobby } from '../lib/socket.ts';
import { peso, plural } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { useLobby } from '../store/lobby.ts';

export default function Watch() {
  useTitle('Watch');
  const lobby = useLobby((s) => s.lobby);

  useEffect(() => {
    subscribeLobby(true);
    return () => subscribeLobby(false);
  }, []);

  return (
    <div className="column pt-6">
      <div className="mb-5">
        <h1 className="text-title">Watch</h1>
        <p className="mt-1 text-body text-muted">
          {lobby ? `${plural(lobby.live.length, 'public game')} in play. Boards update live.` : 'Live public games.'}
        </p>
      </div>
      {!lobby ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-card" />
          ))}
        </div>
      ) : lobby.live.length ? (
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {lobby.live.map((g) => (
            <LiveCard key={g.code} game={g} />
          ))}
          {lobby.live.length % 3 !== 0 && <JoinCard waiting={lobby.open.length} />}
        </ul>
      ) : (
        <EmptyState action={<ButtonLink to="/play" variant="secondary">Find a game</ButtonLink>}>
          No public games in play right now. Private rooms are never listed.
        </EmptyState>
      )}
    </div>
  );
}

/** Closes the grid when it has a gap: the next board on this page could be yours. */
function JoinCard({ waiting }: { waiting: number }) {
  const start = useMemo(() => initialBoard(), []);
  return (
    <li className="rounded-card bg-surface p-3.5 max-lg:hidden">
      <div className="opacity-60">
        <Board board={start} orientation="red" coordinates={false} hints={false} label="Starting position" />
      </div>
      <div className="mt-3 flex flex-col gap-2 px-1">
        <h2 className="text-card font-semibold">Your game could be here</h2>
        <p className="text-meta text-muted">
          {waiting ? `${plural(waiting, 'public room')} waiting for an opponent.` : 'Quick matches are public and show up here.'}
        </p>
        <ButtonLink to="/play" variant="secondary" className="mt-1 self-start">
          Find a game
        </ButtonLink>
      </div>
    </li>
  );
}

function LiveCard({ game }: { game: LiveGame }) {
  const board = useMemo(() => decodeBoard(game.board), [game.board]);
  return (
    <li className="animate-row">
      <Link to={`/room/${game.code}`} className="group block rounded-card bg-surface p-3.5 transition-colors hover:bg-raised">
        <Board board={board} orientation="red" coordinates={false} hints={false} label={`${game.red.name} against ${game.blue.name}`} />
        <div className="mt-3 flex flex-col gap-1.5 px-1">
          {(['blue', 'red'] as const).map((side) => (
            <p key={side} className="flex items-center gap-2">
              <SideDot side={side} />
              <span className={`min-w-0 flex-1 truncate font-medium ${game.turn === side ? 'text-ink' : 'text-muted'}`}>{game[side].name}</span>
              <span className="num text-meta text-faint">{game[side].rating}</span>
              <span className="num w-14 text-right font-semibold">{peso(game.scores[side])}</span>
            </p>
          ))}
          <p className="num mt-1 text-meta text-muted">
            {game.mode === 'quick' ? 'Quick match' : 'Room'} · {timeControlLabel(game.settings)}
            {game.spectators ? ` · ${game.spectators} watching` : ''}
          </p>
        </div>
      </Link>
    </li>
  );
}
