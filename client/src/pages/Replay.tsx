import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { applyStep, endGame, initialState, type GameState, type Side, type StepRecord } from '../../../shared/engine.ts';
import { END_REASON_TEXT } from '../../../shared/notation.ts';
import { timeControlLabel } from '../../../shared/presets.ts';
import type { GameDetail } from '../../../shared/protocol.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { GameLayout } from '../components/game/GameLayout.tsx';
import { PlayerStrip, type PlayerInfo } from '../components/game/PlayerStrip.tsx';
import { Ledger } from '../components/game/Ledger.tsx';
import { Button, IconButton } from '../components/ui/Button.tsx';
import { EmptyState, Pill, Skeleton } from '../components/ui/controls.tsx';
import { useApi } from '../lib/useApi.ts';
import { useTitle } from '../lib/useTitle.ts';
import { relativeTime } from '../lib/format.ts';
import { playStep } from '../lib/sound.ts';

export default function Replay() {
  const id = useParams().id!;
  const { data, error, loading, reload } = useApi<GameDetail>(`/games/${id}`);
  useTitle(data ? `${data.red.name} vs ${data.blue.name}` : 'Replay');

  if (loading && !data) {
    return (
      <div className="column pt-6" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <div className="mt-5 grid gap-3.5 lg:grid-cols-[minmax(0,640px)_384px]">
          <Skeleton className="aspect-square rounded-board" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="column pt-6">
        <h1 className="text-title">Game not found</h1>
        <div className="mt-4">
          <EmptyState action={<Button variant="ghost" onClick={reload}>Retry</Button>}>{error ?? 'No saved game with that id.'}</EmptyState>
        </div>
      </div>
    );
  }
  return <ReplayView game={data} />;
}

function ReplayView({ game }: { game: GameDetail }) {
  // Every position of the game, computed once.
  const { states, records } = useMemo(() => {
    let s = initialState({ maxCapture: game.settings.maxCapture });
    const states: GameState[] = [s];
    const records: StepRecord[] = [];
    for (const step of game.steps) {
      const r = applyStep(s, step);
      s = r.state;
      states.push(s);
      records.push(r.record);
    }
    return { states, records };
  }, [game]);

  const total = records.length;
  const [pos, setPos] = useState(total); // number of steps shown
  const [playing, setPlaying] = useState(false);
  const [orientation, setOrientation] = useState<Side>('red');

  const go = (n: number, sound = true) => {
    const next = Math.max(0, Math.min(total, n));
    if (sound && next === pos + 1) playStep(records[next - 1]);
    setPos(next);
  };

  useEffect(() => {
    if (!playing) return;
    if (pos >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => go(pos + 1), 700);
    return () => clearTimeout(t);
  }, [playing, pos, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [role="slider"]')) return;
      if (e.key === 'ArrowLeft') go(pos - 1);
      if (e.key === 'ArrowRight') go(pos + 1);
      if (e.key === 'Home') go(0);
      if (e.key === 'End') go(total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let state = states[pos];
  // The saved result (resign, clocks…) applies to the final position.
  if (pos === total && !state.result) state = endGame(state, game.reason, game.reason === 'agreement' ? null : game.winner);
  const last = pos > 0 ? records[pos - 1] : null;
  const mark: BoardMark | null = last ? { from: last.from, to: last.to, captureSquare: last.captureSquare, captured: last.captured, key: last.index } : null;
  const players: Record<Side, PlayerInfo> = {
    red: { id: game.red.id, name: game.red.name, rating: game.red.rating },
    blue: { id: game.blue.id, name: game.blue.name, rating: game.blue.rating },
  };
  const strip = (side: Side) => (
    <PlayerStrip side={side} player={players[side]} score={state.scores[side]} toMove={!state.result && state.turn === side} moveLeft={null} moveSeconds={0} now={0} over={pos === total} />
  );
  const winnerName = game.winner ? players[game.winner].name : null;

  return (
    <GameLayout
      header={
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-title">
              {game.red.name} vs {game.blue.name}
            </h1>
            <p className="num mt-1 text-body text-muted">
              {winnerName ? `${winnerName} won` : 'Draw'} · {END_REASON_TEXT[game.reason]} · ₱{game.scores.red}–₱{game.scores.blue} · {relativeTime(game.endedAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Pill>{game.rated ? 'Rated' : 'Casual'}</Pill>
            <Pill>{timeControlLabel(game.settings)}</Pill>
          </div>
        </div>
      }
      board={<Board board={state.board} orientation={orientation} last={mark} label={`Replay, step ${pos} of ${total}`} hints={false} />}
      top={strip(orientation === 'red' ? 'blue' : 'red')}
      bottom={strip(orientation)}
      panel={
        <>
          <div className="flex items-center justify-between px-5.5 pt-4 pb-2">
            <h2 className="text-card font-semibold">Ledger</h2>
            <span className="num text-meta text-muted">
              Step {pos} of {total}
            </span>
          </div>
          <Ledger records={records} current={pos - 1} onSelect={(i) => go(i + 1, false)} className="mt-1 min-h-0 flex-1 px-5.5 pt-1 pb-3" />
        </>
      }
      actions={
        <div className="flex w-full flex-col gap-2">
          <input
            type="range"
            min={0}
            max={total}
            value={pos}
            onChange={(e) => go(Number(e.target.value), false)}
            aria-label="Step"
            className="w-full accent-[var(--text)]"
          />
          <div className="flex items-center gap-1">
            <IconButton icon="first" label="First position" onClick={() => go(0)} disabled={pos === 0} />
            <IconButton icon="chevronLeft" label="Previous step" onClick={() => go(pos - 1)} disabled={pos === 0} />
            <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onClick={() => (pos >= total ? (go(0, false), setPlaying(true)) : setPlaying((p) => !p))} />
            <IconButton icon="chevronRight" label="Next step" onClick={() => go(pos + 1)} disabled={pos === total} />
            <IconButton icon="last" label="Final position" onClick={() => go(total)} disabled={pos === total} />
            <span className="flex-1" />
            <IconButton icon="flip" label="Flip board" onClick={() => setOrientation((o) => (o === 'red' ? 'blue' : 'red'))} />
          </div>
        </div>
      }
    />
  );
}
