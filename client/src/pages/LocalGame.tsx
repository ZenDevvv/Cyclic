// Offline play on this device: against the bot (in a worker) or pass-and-play. Not rated, kept across reloads.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endGame, other, replay, type GameState, type Side, type Step, type StepRecord } from '../../../shared/engine.ts';
import { BOT_LEVELS, type BotLevel } from '../../../shared/bot.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { GameLayout } from '../components/game/GameLayout.tsx';
import { PlayerStrip, type PlayerInfo } from '../components/game/PlayerStrip.tsx';
import { Ledger } from '../components/game/Ledger.tsx';
import { ResultDialog, resultTitle } from '../components/game/ResultDialog.tsx';
import { Button, IconButton } from '../components/ui/Button.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { Segmented, Switch } from '../components/ui/controls.tsx';
import { usePrefs } from '../store/prefs.ts';
import { useSession } from '../store/session.ts';
import { askBot } from '../lib/bot.ts';
import { play, playEnd, playIllegal, playStep } from '../lib/sound.ts';
import { useTitle } from '../lib/useTitle.ts';

type Mode = 'bot' | 'local';

interface Saved {
  steps: Step[];
  level: BotLevel;
  you: Side;
  resigned?: Side | null;
}

const key = (mode: Mode) => `scidama.local.${mode}`;

function load(mode: Mode): Saved | null {
  try {
    const raw = localStorage.getItem(key(mode));
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    replay(s.steps); // throws if the saved game is not valid
    return s;
  } catch {
    return null;
  }
}

function save(mode: Mode, s: Saved) {
  try {
    localStorage.setItem(key(mode), JSON.stringify(s));
  } catch {
    // Storage full or blocked: the game still works, it just won't survive a reload.
  }
}

export function LocalGame({ mode }: { mode: Mode }) {
  useTitle(mode === 'bot' ? 'Play the bot' : 'Pass and play');
  const prefs = usePrefs();
  const me = useSession((s) => s.me);
  const [game, setGame] = useState<Saved>(() => load(mode) ?? { steps: [], level: prefs.botLevel, you: 'red', resigned: null });
  const [setupOpen, setSetupOpen] = useState(() => mode === 'bot' && !load(mode));
  const [resultOpen, setResultOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    save(mode, game);
  }, [mode, game]);

  const { state, records } = useMemo(() => {
    const r = replay(game.steps);
    let state: GameState = r.state;
    if (game.resigned && !state.result) state = endGame(state, 'resign', other(game.resigned));
    return { state, records: r.records };
  }, [game.steps, game.resigned]);

  const last: StepRecord | null = records[records.length - 1] ?? null;
  const mark: BoardMark | null = last
    ? { from: last.from, to: last.to, captureSquare: last.captureSquare, captured: last.captured, key: last.index }
    : null;

  // Sounds and the result dialog follow the record count.
  const seen = useRef(records.length);
  useEffect(() => {
    if (records.length > seen.current && last) playStep(last);
    seen.current = records.length;
  }, [records.length, last]);
  const wasOver = useRef(!!state.result);
  useEffect(() => {
    if (state.result && !wasOver.current) {
      const r = state.result;
      playEnd(r.winner === null ? 'draw' : mode === 'local' || r.winner === game.you ? 'win' : 'lose');
      setTimeout(() => setResultOpen(true), 500);
    }
    wasOver.current = !!state.result;
  }, [state.result, mode, game.you]);

  const humanTurn = mode === 'local' || state.turn === game.you;

  // The bot plays its whole turn, one step at a time so you can follow it.
  useEffect(() => {
    if (mode !== 'bot' || state.result || state.turn === game.you) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setThinking(true);
    const started = Date.now();
    const job = askBot(state, game.level);
    cancelRef.current = () => {
      alive = false;
      job.cancel();
      timers.forEach(clearTimeout);
      setThinking(false);
    };
    void job.result.then((steps) => {
      if (!alive || !steps.length) return;
      const wait = Math.max(0, 450 - (Date.now() - started));
      steps.forEach((step, i) => {
        timers.push(
          setTimeout(() => {
            if (!alive) return;
            setGame((g) => ({ ...g, steps: [...g.steps, step] }));
            if (i === steps.length - 1) setThinking(false);
          }, wait + i * 520),
        );
      });
    });
    return () => {
      alive = false;
      job.cancel();
      timers.forEach(clearTimeout);
    };
    // The bot reacts to the position only.
  }, [state, mode]);

  const onStep = useCallback((step: Step) => setGame((g) => ({ ...g, steps: [...g.steps, step] })), []);

  const newGame = (patch: Partial<Saved> = {}) => {
    cancelRef.current();
    setResultOpen(false);
    const next: Saved = { steps: [], level: game.level, you: game.you, resigned: null, ...patch };
    seen.current = 0;
    wasOver.current = false;
    setGame(next);
    if (patch.level) prefs.set({ botLevel: patch.level });
  };

  const undo = () => {
    cancelRef.current();
    // Back to the start of your previous turn (bot) or the previous turn (pass and play).
    const mine = mode === 'bot' ? records.filter((r) => r.side === game.you) : records;
    const lastTurn = mine[mine.length - 1];
    if (!lastTurn) return;
    const firstIndex = records.find((r) => r.turn === lastTurn.turn)!.index;
    play('move');
    setGame((g) => ({ ...g, steps: g.steps.slice(0, firstIndex), resigned: null }));
    setResultOpen(false);
  };

  const orientation: Side =
    mode === 'bot' ? (flipped ? other(game.you) : game.you) : prefs.localAutoFlip ? (flipped ? other(state.turn) : state.turn) : flipped ? 'blue' : 'red';
  const bottomSide = orientation;
  const topSide = other(orientation);

  const levelName = BOT_LEVELS.find((l) => l.id === game.level)!.name;
  const players: Record<Side, PlayerInfo> =
    mode === 'bot'
      ? {
          [game.you]: { id: me?.id, name: me?.name ?? 'You', tag: 'You' },
          [other(game.you)]: { name: `Bot · ${levelName}`, tag: thinking ? 'Thinking…' : 'Computer', bot: true },
        } as Record<Side, PlayerInfo>
      : { red: { name: 'Red', tag: 'Player 1' }, blue: { name: 'Blue', tag: 'Player 2' } };

  const strip = (side: Side) => (
    <PlayerStrip side={side} player={players[side]} score={state.scores[side]} toMove={state.turn === side} moveLeft={null} moveSeconds={0} now={Date.now()} over={!!state.result} />
  );

  return (
    <>
      <GameLayout
        header={
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-title">{mode === 'bot' ? 'Play the bot' : 'Pass and play'}</h1>
              <p className="text-body text-muted">
                {mode === 'bot'
                  ? `${levelName} bot · you play ${game.you} · not rated, saved on this device`
                  : 'Two players, one screen · saved on this device'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => (mode === 'bot' ? setSetupOpen(true) : newGame())}>
              New game
            </Button>
          </div>
        }
        board={
          <Board
            board={state.board}
            state={state}
            orientation={orientation}
            interactive={humanTurn && !state.result}
            onStep={onStep}
            onIllegal={playIllegal}
            last={mark}
            label={`Board, ${state.turn} to move`}
          />
        }
        top={strip(topSide)}
        bottom={strip(bottomSide)}
        panel={
          <>
            <div className="flex items-center justify-between px-5.5 pt-4 pb-2">
              <h2 className="text-card font-semibold">Ledger</h2>
              <span className="num text-meta text-muted">
                {state.result ? resultTitle(state.result, players, mode === 'bot' ? game.you : null) : `Turn ${state.turnNumber}`}
              </span>
            </div>
            <Ledger records={records} className="mt-1 min-h-0 flex-1 px-5.5 pt-1 pb-3" />
          </>
        }
        actions={
          <>
            <Button icon="refresh" variant="ghost" onClick={undo} disabled={!records.length || (mode === 'bot' && !records.some((r) => r.side === game.you))}>
              Take back
            </Button>
            {mode === 'bot' && !state.result && (
              <Button icon="flag" variant="ghost" onClick={() => setGame((g) => ({ ...g, resigned: g.you }))}>
                Resign
              </Button>
            )}
            {state.result && (
              <Button variant="ghost" onClick={() => setResultOpen(true)}>
                Result
              </Button>
            )}
            <span className="flex-1" />
            {mode === 'local' && (
              <Switch checked={prefs.localAutoFlip} onChange={(v) => prefs.set({ localAutoFlip: v })} label="Turn board each move" />
            )}
            <IconButton icon="flip" label="Flip board" onClick={() => setFlipped((f) => !f)} />
          </>
        }
      />

      {state.result && (
        <ResultDialog
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          result={state.result}
          captures={state.scores}
          players={players}
          mySide={mode === 'bot' ? game.you : null}
        >
          <Button variant="ghost" onClick={() => setResultOpen(false)}>
            Look at the board
          </Button>
          <Button variant="primary" onClick={() => newGame(mode === 'bot' ? { you: other(game.you) } : {})}>
            {mode === 'bot' ? 'Play again, swap sides' : 'Play again'}
          </Button>
        </ResultDialog>
      )}

      {mode === 'bot' && (
        <BotSetup
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          level={game.level}
          you={game.you}
          onStart={(level, you) => {
            setSetupOpen(false);
            newGame({ level, you });
          }}
        />
      )}
    </>
  );
}

function BotSetup({
  open,
  onClose,
  level: initialLevel,
  you: initialSide,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  level: BotLevel;
  you: Side;
  onStart: (level: BotLevel, you: Side) => void;
}) {
  const [level, setLevel] = useState<BotLevel>(initialLevel);
  const [side, setSide] = useState<Side | 'random'>(initialSide);
  return (
    <Dialog open={open} onClose={onClose} title="Play the bot" description="Practice on this device. Games against the bot are not rated.">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-body font-medium">Strength</p>
          <Segmented label="Strength" value={level} onChange={setLevel} options={BOT_LEVELS.map((l) => ({ value: l.id, label: l.name }))} />
          <p className="mt-2 text-meta text-muted">{BOT_LEVELS.find((l) => l.id === level)!.description}</p>
        </div>
        <div>
          <p className="mb-2 text-body font-medium">You play</p>
          <Segmented
            label="Your side"
            value={side}
            onChange={setSide}
            options={[
              { value: 'red', label: 'Red, first' },
              { value: 'blue', label: 'Blue' },
              { value: 'random', label: 'Random' },
            ]}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onStart(level, side === 'random' ? (Math.random() < 0.5 ? 'red' : 'blue') : side)}>
            Start game
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
