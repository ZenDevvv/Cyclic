// The rules, with live boards that run the real engine: read a rule, then try it.
import { useMemo, useState, type ReactNode } from 'react';
import {
  applyStep,
  initialBoard,
  initialState,
  scoreCapture,
  sq,
  type Cell,
  type GameState,
  type Piece,
  type Side,
  type Step,
  type StepRecord,
  type Unit,
} from '../../../shared/engine.ts';
import { equationParts } from '../../../shared/notation.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { Chip } from '../components/board/Chip.tsx';
import { Ledger } from '../components/game/Ledger.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { useTitle } from '../lib/useTitle.ts';
import { playIllegal, playStep } from '../lib/sound.ts';

type Spec = [x: number, y: number, side: Side, unit: Unit, value: number, king?: boolean];

function position(specs: Spec[], turn: Side = 'red'): GameState {
  const board: Cell[] = new Array(64).fill(null);
  specs.forEach(([x, y, side, unit, value, king = false], n) => {
    board[sq(x, y)] = { id: `${side}-${n}`, side, unit, value, king };
  });
  return { ...initialState(), board, turn };
}

function Demo({ specs, caption, turnLimit = 1 }: { specs: Spec[]; caption: ReactNode; turnLimit?: number }) {
  const start = useMemo(() => position(specs), [specs]);
  const [state, setState] = useState(start);
  const [records, setRecords] = useState<StepRecord[]>([]);
  const done = records.length > 0 && !state.jumper && records[records.length - 1].turn >= turnLimit;
  const last = records[records.length - 1];
  const mark: BoardMark | null = last ? { from: last.from, to: last.to, captureSquare: last.captureSquare, captured: last.captured, key: last.index } : null;

  const onStep = (step: Step) => {
    const r = applyStep(state, step);
    playStep(r.record);
    // Keep the demo on red's side so the reader can keep trying.
    setState(r.record.continues ? r.state : { ...r.state, turn: 'red', result: null });
    setRecords((rs) => [...rs, r.record]);
  };

  return (
    <figure className="rounded-card bg-surface p-3.5">
      <Board
        board={state.board}
        state={state}
        orientation="red"
        interactive={!done}
        onStep={onStep}
        onIllegal={playIllegal}
        last={mark}
        hints
        coordinates
        label="Practice board"
      />
      <figcaption className="mt-3 px-1">
        {records.length ? <Ledger records={records} className="max-h-36" /> : <p className="text-body text-muted">{caption}</p>}
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            icon="refresh"
            disabled={!records.length}
            onClick={() => {
              setState(start);
              setRecords([]);
            }}
          >
            Reset
          </Button>
        </div>
      </figcaption>
    </figure>
  );
}

function Section({ id, title, children, demo }: { id: string; title: string; children: ReactNode; demo?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-16 gap-6 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14">
      <div className="max-w-[62ch]">
        <h2 id={`${id}-h`} className="mb-3 text-title">
          {title}
        </h2>
        <div className="flex flex-col gap-3 text-card leading-[26px] text-ink [&_strong]:font-semibold">{children}</div>
      </div>
      {demo && <div className="lg:pt-1">{demo}</div>}
    </section>
  );
}

const ex = (a: [Unit, number, boolean?], b: [Unit, number, boolean?], op: 'add' | 'sub' | 'mul' | 'div') => {
  const p = (u: Unit, v: number, k = false): Piece => ({ id: 'x', side: 'red', unit: u, value: v, king: k });
  return scoreCapture(p(a[0], a[1], a[2]), p(b[0], b[1], b[2]), op);
};

const EXAMPLES = [
  ex(['P', 8], ['P', 4], 'add'),
  ex(['P', 8], ['P', 4], 'sub'),
  ex(['kWh', 5], ['kWh', 3], 'add'),
  ex(['P', 8, true], ['P', 4], 'add'),
  ex(['P', 8], ['P', 4], 'mul'),
  ex(['kWh', 9], ['kWh', 3], 'div'),
  ex(['P', 8], ['kWh', 3], 'add'),
  ex(['P', 2], ['P', 8], 'sub'),
];

const SAMPLE_CHIPS: Piece[] = [2, 4, 6, 8, 10, 12].map((v) => ({ id: `p${v}`, side: 'red' as const, unit: 'P' as const, value: v, king: false }));
const SAMPLE_KWH: Piece[] = [1, 3, 5, 7, 9, 11].map((v) => ({ id: `k${v}`, side: 'blue' as const, unit: 'kWh' as const, value: v, king: false }));

export default function Learn() {
  useTitle('How to play');
  const startBoard = useMemo(() => initialBoard(), []);
  return (
    <div className="column pt-6">
      <div className="grid gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14">
        <div className="max-w-[62ch]">
          <h1 className="text-title">How to play Scidama</h1>
          <p className="mt-3 text-card leading-[26px]">
            Scidama is checkers where every capture is a sum. Each chip is a quantity, in pesos or in kilowatt-hours. When you jump
            a chip, the sign on the square you land on combines the two quantities, and you score only when the result is still
            money or energy. Highest total at the end wins.
          </p>
          <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-body text-muted">
            {[
              ['board', 'The board'],
              ['moving', 'Moving'],
              ['capturing', 'Capturing'],
              ['scoring', 'Scoring with units'],
              ['dama', 'The dama'],
              ['ending', 'The end'],
              ['online', 'Playing online'],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink to="/play/bot" variant="primary">
              Practice against the bot
            </ButtonLink>
            <ButtonLink to="/play" variant="secondary">
              Find a game
            </ButtonLink>
          </div>
        </div>
        <div className="rounded-card bg-surface p-3.5">
          <Board board={startBoard} orientation="red" label="Starting position" />
        </div>
      </div>

      <Section id="board" title="The board and the chips">
        <p>
          The 8×8 board uses only its light squares. Each light square carries a sign: <strong>+ − × ÷</strong>. The layout is the
          same from both seats. The edges are numbered 0 to 7, so every square has a coordinate like (5,2).
        </p>
        <p>
          Each side has 12 chips: six in pesos (₱2 to ₱12) and six in kilowatt-hours (1 to 11 kWh). Red starts at the bottom and
          moves first.
        </p>
        <div className="mt-2 grid grid-cols-6 gap-2 sm:max-w-md">
          {[...SAMPLE_CHIPS, ...SAMPLE_KWH].map((p) => (
            <span key={p.id} className="aspect-square">
              <Chip piece={p} />
            </span>
          ))}
        </div>
      </Section>

      <Section
        id="moving"
        title="Moving"
        demo={<Demo specs={[[3, 2, 'red', 'P', 6], [0, 7, 'blue', 'P', 2]]} caption="Tap the ₱6 chip, then one of the marked squares." />}
      >
        <p>
          A chip moves one square diagonally <strong>forward</strong> onto an empty square. Tap a chip to see where it can go, then
          tap the square, or drag it there.
        </p>
        <p>Turns alternate. Each player has a move clock (usually 60 seconds) and the whole game has a clock (usually 20 minutes).</p>
      </Section>

      <Section
        id="capturing"
        title="Capturing"
        demo={
          <Demo
            specs={[
              [2, 1, 'red', 'P', 8],
              [6, 1, 'red', 'kWh', 5],
              [3, 2, 'blue', 'P', 4],
              [3, 4, 'blue', 'P', 2],
              [0, 7, 'blue', 'kWh', 3],
            ]}
            caption="One of your chips must capture. The ₱8 can take two in a row."
          />
        }
      >
        <p>
          Jump over an opponent's chip next to you onto the empty square behind it. Chips capture in <strong>all four</strong>{' '}
          directions, backward too.
        </p>
        <p>
          <strong>Capturing is compulsory.</strong> If any of your chips can capture, you must capture. If the chip that captured
          can capture again, it keeps going in the same turn.
        </p>
        <p className="text-body text-muted">
          Room option: with "take the most chips" on, you must choose the sequence that captures the most, as in tournament Damath.
        </p>
      </Section>

      <Section id="scoring" title="Scoring with units">
        <p>
          The sign on the square where your chip <strong>lands</strong> combines your chip with the one you took. Only adding or
          subtracting <strong>like units</strong> gives a quantity, so only those score:
        </p>
        <ul className="flex flex-col gap-1.5 pl-1">
          <li>₱ with ₱, or kWh with kWh, on + or −: scores.</li>
          <li>× or ÷: no score. ₱ × ₱ is not money.</li>
          <li>Different units: no score. ₱ + kWh is not a quantity.</li>
          <li>A subtraction below zero scores nothing.</li>
        </ul>
        <p>
          A dama doubles the result, and taking a dama doubles it again. Energy is converted to money at <strong>₱3 per kWh</strong>.
        </p>
        <div className="mt-2 rounded-card bg-surface p-4">
          <p className="mb-2 text-meta text-muted">Examples, as they appear in the ledger</p>
          <ul className="flex flex-col">
            {EXAMPLES.map((eq, i) => {
              const p = equationParts(eq);
              return (
                <li key={i} className="num flex items-baseline justify-between gap-3 border-b border-rule py-1.5 text-body last:border-b-0">
                  <span className="text-muted">
                    <span className="text-ink">{p.left}</span> = {p.result}
                    {p.factors.length > 0 && <span className="text-faint"> · {p.factors.join(' · ')}</span>}
                  </span>
                  {p.scored ? <span className="flex-none font-semibold text-accent">+₱{eq.points}</span> : <span className="flex-none text-meta text-faint">{p.reason}</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-body text-muted">While you choose a capture, each landing square shows what it would score before you commit.</p>
      </Section>

      <Section
        id="dama"
        title="The dama"
        demo={
          <Demo
            specs={[
              [1, 6, 'red', 'P', 10],
              [0, 1, 'red', 'kWh', 7, true],
              [4, 5, 'blue', 'kWh', 9],
              [7, 0, 'blue', 'P', 6],
            ]}
            caption="The dama on (0,1) can fly up the long diagonal and take the 9 kWh from a distance."
          />
        }
      >
        <p>
          A chip that ends its turn on the far row is crowned a <strong>dama</strong>. A dama moves any distance along a diagonal,
          and captures from a distance: it slides up to an opponent's chip, jumps it, and may land on any empty square beyond.
        </p>
        <p>A chip that reaches the far row in the middle of a multi-capture keeps capturing as a chip; it is crowned only if it stops there.</p>
      </Section>

      <Section id="ending" title="How the game ends">
        <p>The game ends when a side has no chips, the side to move has no legal move, or the game clock runs out.</p>
        <p>
          Every chip still on the board is then added to its owner's score: its value, doubled for a dama, and ×3 for a kWh chip.
          The <strong>higher total wins</strong>, so a side can lose all its chips and still win on points.
        </p>
        <p>Running out of move time loses the game outright. You can also resign or agree a draw.</p>
      </Section>

      <Section id="online" title="Playing online">
        <p>
          <strong>Quick match</strong> pairs you with someone near your rating and starts at once; those games are rated.{' '}
          <strong>Create a room</strong> to play a friend: share the link or the six-letter code, choose the clocks, the sides and
          whether it counts for rating. Public rooms are listed in the lobby; invite-only rooms are not.
        </p>
        <p>
          Anyone can watch public games. If you lose connection, your seat waits 90 seconds for you; reload and you are back in the
          game. After a game, ask for a rematch: sides swap.
        </p>
      </Section>
    </div>
  );
}
