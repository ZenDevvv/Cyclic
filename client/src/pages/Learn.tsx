// The rules, with live boards that run the real engine: read a rule, then try it.
import { useMemo, useState, type ReactNode } from 'react';
import {
  applyStep,
  GRADES,
  initialBoard,
  initialState,
  KWH_RATE,
  scoreCapture,
  sq,
  THI_TABLE,
  type Cell,
  type GameState,
  type Grade,
  type Piece,
  type Side,
  type Step,
  type StepRecord,
  type Unit,
} from '../../../shared/engine.ts';
import { equationParts, gradeName, scoringGuide } from '../../../shared/notation.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { Chip } from '../components/board/Chip.tsx';
import { MathText } from '../components/ui/MathText.tsx';
import { Ledger } from '../components/game/Ledger.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { useTitle } from '../lib/useTitle.ts';
import { playIllegal, playStep } from '../lib/sound.ts';

type Spec = [x: number, y: number, side: Side, unit: Unit, value: number, king?: boolean];

function position(specs: Spec[], grade: Grade, turn: Side = 'red'): GameState {
  const board: Cell[] = new Array(64).fill(null);
  specs.forEach(([x, y, side, unit, value, king = false], n) => {
    board[sq(x, y)] = { id: `${side}-${n}`, side, unit, value, king };
  });
  return { ...initialState({ grade }), board, turn };
}

function Demo({ specs, caption, grade = 7, turnLimit = 1 }: { specs: Spec[]; caption: ReactNode; grade?: Grade; turnLimit?: number }) {
  const start = useMemo(() => position(specs, grade), [specs, grade]);
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
        {records.length ? <Ledger records={records} grade={grade} className="max-h-36" /> : <p className="text-body text-muted">{caption}</p>}
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

/** A grade's twelve chips, as they look on the board. */
function GradeChips({ grade }: { grade: Grade }) {
  return (
    <div className="mt-2 grid grid-cols-6 gap-2 sm:max-w-md">
      {GRADES[grade].chips.map((chip) => (
        <span key={`${chip.unit}${chip.value}`} className="aspect-square">
          <Chip piece={{ ...chip, side: 'red', king: false }} />
        </span>
      ))}
    </div>
  );
}

/** Worked captures, computed by the engine. */
function GradeExamples({ grade }: { grade: Grade }) {
  const { equations, note } = scoringGuide(grade);
  return (
    <div className="mt-2 rounded-card bg-surface p-4">
      <ul className="flex flex-col">
        {equations.map((equation) => {
          const p = equationParts(equation);
          return (
            <li key={p.left} className="num flex items-baseline justify-between gap-3 border-b border-rule py-1.5 text-body last:border-b-0">
              <span className="min-w-0 text-muted">
                <span className="text-ink">
                  <MathText>{p.left}</MathText>
                </span>{' '}
                = <MathText>{p.result}</MathText>
              </span>
              {p.scored ? (
                <span className="flex-none font-semibold text-accent">
                  <MathText>{`+${p.points}`}</MathText>
                </span>
              ) : (
                <span className="flex-none text-meta text-faint">{p.reason}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-meta text-muted">{note}</p>
    </div>
  );
}

function ThiTable() {
  return (
    <table className="num mt-2 w-full max-w-md border-collapse text-body">
      <caption className="mb-1 text-left text-meta text-muted">Relative humidity and the °F it scores</caption>
      <tbody className="grid grid-cols-3 gap-x-6">
        {Object.entries(THI_TABLE).map(([humidity, fahrenheit]) => (
          <tr key={humidity} className="flex justify-between border-b border-rule py-1">
            <th scope="row" className="font-normal text-muted">
              {humidity}%
            </th>
            <td>{fahrenheit}°F</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
            money or energy. Everything you score counts against you: the lowest total at the end wins.
          </p>
          <p className="mt-3 text-body text-muted">
            This page teaches Grade 7, Electro. Grades 8, 9 and 10 play on the same board with the same moves, and change the chips
            and the scoring: see <a href="#grades" className="text-ink underline-offset-4 hover:underline">the other grades</a>.
          </p>
          <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-body text-muted">
            {[
              ['board', 'The board'],
              ['moving', 'Moving'],
              ['capturing', 'Capturing'],
              ['scoring', 'Scoring with units'],
              ['dama', 'The dama'],
              ['ending', 'The end'],
              ['grades', 'The other grades'],
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
        <p>
          <strong>The most chips come first.</strong> You must choose the capture that takes the most chips, and on equal counts a
          dama goes before an ordinary chip.
        </p>
        <p>
          <strong>Auto-capture.</strong> When a capture is your only legal move, the game plays it for you after a moment and says
          so above the ledger.
        </p>
        <p className="text-body text-muted">A room's host can turn off either rule before the game starts.</p>
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
          A dama doubles the result, and taking a dama doubles it again. Energy is converted to money at <strong>₱{KWH_RATE} per kWh</strong>.
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
          Every chip still on the board is then added to its owner's score: its value, doubled for a dama, and ×{KWH_RATE} for a kWh chip.
          The <strong>lower total wins</strong>, so a side can lose all its chips and still win on points.
        </p>
        <p>Running out of move time loses the game outright. You can also resign or agree a draw.</p>
      </Section>

      <Section id="grades" title="The other grades">
        <p>
          Each grade teaches a different science topic. The board, the moves, capture priority and the dama are the same in all of
          them, and the <strong>lowest total still wins</strong>. Choose a grade when you create a room, join quick match, or start
          a game on this device.
        </p>
      </Section>

      <Section
        id="grade-8"
        title={gradeName(8)}
        demo={
          <Demo
            grade={8}
            specs={[
              [2, 3, 'red', 'sci', 2.2e2],
              [3, 4, 'blue', 'sci', 4.4e4],
              [1, 4, 'blue', 'sci', 1.1e-1],
              [7, 6, 'blue', 'sci', 3.3e-3],
            ]}
            caption="The 2.2 × 10² chip can capture either way. Tap it and compare the two landing squares."
          />
        }
      >
        <p>
          Every chip is a number in scientific notation, from <MathText>1.111 × 10⁻¹¹</MathText> to <MathText>1.212 × 10¹²</MathText>. Odd-numbered chips have negative
          exponents and even-numbered chips positive ones. There are no units to mismatch, so <strong>all four signs score</strong>,
          and a subtraction below zero scores nothing. Your final score is everything you captured plus your chips left on the board.
        </p>
        <GradeChips grade={8} />
        <GradeExamples grade={8} />
        <p className="text-body text-muted">
          The published rules do not explain how this grade scores, so these are Scidama Online's own rules. Numbers are kept in
          full and rounded to five figures for display.
        </p>
      </Section>

      <Section
        id="grade-9"
        title={gradeName(9)}
        demo={
          <Demo
            grade={9}
            specs={[
              [0, 3, 'red', 'pct', 25],
              [1, 4, 'blue', 'pct', 40],
              [7, 6, 'blue', 'F', 70],
            ]}
            caption="Take the 40% chip. The + square makes 65%, and the table turns that into 91°F."
          />
        }
      >
        <p>
          Chips are relative humidity (%) or temperature (°F). On a + or − square, two humidity chips make a humidity, and the table
          below turns it into °F for your score. Two temperature chips add straight to your score. <strong>× and ÷ score nothing</strong>,
          and neither do mixed units or a subtraction below zero.
        </p>
        <GradeChips grade={9} />
        <GradeExamples grade={9} />
        <ThiTable />
        <p>Chips left on the board count the same way, each humidity chip looked up alone. Final totals are shown in °C as well.</p>
      </Section>

      <Section
        id="grade-10"
        title={gradeName(10)}
        demo={
          <Demo
            grade={10}
            specs={[
              [2, 3, 'red', 'g', 37],
              [3, 4, 'blue', 'C', 11],
              [7, 6, 'blue', 'g', 3],
            ]}
            caption="Take the 11°C chip on the × square: grams times degrees goes in its own column."
          />
        }
      >
        <p>
          Chips are mass (g) or temperature (°C). Like units add or subtract into their own column. Different units score only on
          × , which goes in a third column, <strong>g·°C</strong>. Everything else scores nothing.
        </p>
        <GradeChips grade={10} />
        <GradeExamples grade={10} />
        <p>
          At the end, chips left on the board join their columns, and your score is <strong>(total g × total °C) + total g·°C</strong>,
          in calories. Your score reads 0 until you have both grams and °C, so watch the score sheet above the ledger.
        </p>
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
