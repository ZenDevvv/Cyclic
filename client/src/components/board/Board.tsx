// The Scidama board. Squares are buttons; chips sit in a layer above them, keyed by id so moves slide.
// Click-to-move, drag and keyboard share one code path (`press`).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  legalSteps,
  mustCaptureSquares,
  OPERATORS,
  scoreCapture,
  sq,
  xOf,
  yOf,
  type Cell,
  type GameState,
  type LegalStep,
  type Op,
  type Piece,
  type Side,
  type Step,
} from '../../../../shared/engine.ts';
import { chipLabel, OP_NAME, SIDE_NAME } from '../../../../shared/notation.ts';
import { usePrefs, type BoardTheme, type PieceSet } from '../../store/prefs.ts';
import { Chip } from './Chip.tsx';

export interface BoardMark {
  from: number;
  to: number;
  captureSquare: number | null;
  captured: Piece | null;
  /** Changes for every step so the capture ghost replays. */
  key: string | number;
}

export interface BoardProps {
  board: readonly Cell[];
  orientation: Side;
  /** Needed for legal moves when interactive. */
  state?: GameState;
  interactive?: boolean;
  onStep?: (step: Step) => void;
  onIllegal?: () => void;
  last?: BoardMark | null;
  /** Extra squares to ring (rules page). */
  highlight?: number[];
  label?: string;
  theme?: BoardTheme;
  pieceSet?: PieceSet;
  hints?: boolean;
  coordinates?: boolean;
  className?: string;
}

const visual = (square: number, orientation: Side) =>
  orientation === 'red' ? { col: xOf(square), row: 7 - yOf(square) } : { col: 7 - xOf(square), row: yOf(square) };

const fromVisual = (col: number, row: number, orientation: Side) =>
  orientation === 'red' ? sq(col, 7 - row) : sq(7 - col, row);

const chipStyle = (square: number, orientation: Side): CSSProperties => {
  const { col, row } = visual(square, orientation);
  return { transform: `translate(${col * 100}%, ${row * 100}%)` };
};

export const Board = memo(function Board(props: BoardProps) {
  const prefs = usePrefs();
  const {
    board,
    orientation,
    state,
    interactive = false,
    onStep,
    onIllegal,
    last,
    highlight,
    label = 'Board',
    theme = prefs.boardTheme,
    pieceSet = prefs.pieceSet,
    hints = prefs.hints,
    coordinates = prefs.coordinates,
    className = '',
  } = props;

  const [selected, setSelected] = useState<number | null>(null);
  const [focusSq, setFocusSq] = useState<number>(() => (orientation === 'red' ? sq(1, 0) : sq(6, 7)));
  const [shake, setShake] = useState<{ square: number; n: number } | null>(null);
  const [drag, setDrag] = useState<{ square: number; x: number; y: number } | null>(null);
  const [flashMust, setFlashMust] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; square: number; x: number; y: number; moved: boolean } | null>(null);

  const legal: LegalStep[] = useMemo(() => (interactive && state ? legalSteps(state) : []), [interactive, state]);
  const must = useMemo(() => (interactive && state ? mustCaptureSquares(state) : []), [interactive, state]);
  const movable = useMemo(() => new Set(legal.map((s) => s.from)), [legal]);

  // A multi-capture locks the selection to the jumping chip.
  const jumper = interactive ? state?.jumper ?? null : null;
  const active = jumper ?? selected;
  const targets = useMemo(() => legal.filter((s) => s.from === active), [legal, active]);

  useEffect(() => {
    if (selected !== null && !movable.has(selected)) setSelected(null);
  }, [movable, selected]);

  const commit = useCallback(
    (step: LegalStep) => {
      setSelected(null);
      onStep?.({ from: step.from, to: step.to });
    },
    [onStep],
  );

  const reject = useCallback(
    (square: number) => {
      setShake({ square, n: Date.now() });
      if (must.length) setFlashMust(Date.now());
      onIllegal?.();
    },
    [must.length, onIllegal],
  );

  /** One interaction on a square, from a click, a tap, a drop or the keyboard. */
  const press = useCallback(
    (square: number) => {
      if (!interactive || !state) return;
      const target = targets.find((t) => t.to === square);
      if (target) return commit(target);
      const piece = board[square];
      if (piece && piece.side === state.turn) {
        if (jumper !== null && square !== jumper) return reject(square);
        if (!movable.has(square)) return reject(square);
        setSelected((cur) => (cur === square && jumper === null ? null : square));
        return;
      }
      if (jumper === null) setSelected(null);
    },
    [interactive, state, targets, commit, board, jumper, movable, reject],
  );

  // ---------------------------------------------------------------- pointer (click and drag)

  const squareAt = (clientX: number, clientY: number): number | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return fromVisual(col, row, orientation);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    const square = squareAt(e.clientX, e.clientY);
    if (square === null) return;
    pointer.current = { id: e.pointerId, square, x: e.clientX, y: e.clientY, moved: false };
    const piece = board[square];
    if (piece && state && piece.side === state.turn && movable.has(square) && (jumper === null || jumper === square)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    const piece = board[p.square];
    if (!piece || !state || piece.side !== state.turn || !movable.has(p.square)) return;
    if (jumper !== null && jumper !== p.square) return;
    if (!p.moved) {
      p.moved = true;
      setSelected(p.square);
    }
    const rect = boardRef.current!.getBoundingClientRect();
    setDrag({ square: p.square, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onPointerUp = (e: PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.id !== e.pointerId) return;
    if (p.moved) {
      setDrag(null);
      const to = squareAt(e.clientX, e.clientY);
      const step = legal.find((s) => s.from === p.square && s.to === to);
      if (step) commit(step);
      return;
    }
    const square = squareAt(e.clientX, e.clientY);
    if (square !== null) {
      setFocusSq(square);
      press(square);
    }
  };

  const onPointerCancel = () => {
    pointer.current = null;
    setDrag(null);
  };

  // ---------------------------------------------------------------- keyboard

  const onKeyDown = (e: KeyboardEvent) => {
    const { col, row } = visual(focusSq, orientation);
    const moveTo = (c: number, r: number) => {
      // Step to the nearest playable square in that direction.
      for (const dc of [0, 1, -1]) {
        const nc = c + dc;
        if (nc < 0 || nc > 7 || r < 0 || r > 7) continue;
        const s = fromVisual(nc, r, orientation);
        if ((xOf(s) + yOf(s)) % 2 === 1) {
          setFocusSq(s);
          boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${s}"]`)?.focus();
          return;
        }
      }
    };
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        return moveTo(col, row - 1);
      case 'ArrowDown':
        e.preventDefault();
        return moveTo(col, row + 1);
      case 'ArrowLeft':
        e.preventDefault();
        return moveTo(col - 2, row);
      case 'ArrowRight':
        e.preventDefault();
        return moveTo(col + 2, row);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return press(focusSq);
      case 'Escape':
        if (jumper === null) setSelected(null);
        return;
    }
  };

  // ---------------------------------------------------------------- render

  const pieces = useMemo(() => {
    const list: { piece: Piece; square: number }[] = [];
    board.forEach((piece, square) => piece && list.push({ piece, square }));
    return list.sort((a, b) => (a.piece.id < b.piece.id ? -1 : 1));
  }, [board]);

  const lastSquares = new Set(last ? [last.from, last.to] : []);
  const targetMap = new Map(targets.map((t) => [t.to, t]));
  const mustSet = new Set(hints && interactive && active === null ? must : []);
  const highlightSet = new Set(highlight ?? []);
  const motion = prefs.motion;

  return (
    <div
      ref={boardRef}
      data-ui
      data-board={theme}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`relative aspect-square w-full overflow-hidden rounded-board select-none ${interactive ? 'touch-none' : ''} ${className}`}
    >
      <div className="grid size-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, n) => {
          const col = n % 8;
          const row = Math.floor(n / 8);
          const square = fromVisual(col, row, orientation);
          const op = OPERATORS[square];
          const showX = coordinates && row === 7;
          const showY = coordinates && col === 0;
          if (!op) {
            return (
              <div key={square} className="relative bg-[var(--sq-dark)]">
                {showX && <Coord pos="x" value={xOf(square)} light={false} />}
                {showY && <Coord pos="y" value={yOf(square)} light={false} />}
              </div>
            );
          }
          const piece = board[square];
          const target = targetMap.get(square);
          const isSel = active === square;
          const canMove = interactive && movable.has(square) && (jumper === null || jumper === square);
          return (
            <button
              key={square}
              type="button"
              data-square={square}
              tabIndex={interactive && square === focusSq ? 0 : -1}
              aria-label={squareName(square, op, piece, { target: !!target, selected: isSel })}
              aria-pressed={isSel || undefined}
              onFocus={() => setFocusSq(square)}
              className={`relative bg-[var(--sq-light)] outline-none focus-visible:z-10 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-white ${canMove || target ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <OperatorGlyph op={op} />
              {lastSquares.has(square) && <span className="absolute inset-0 bg-accent/40" />}
              {highlightSet.has(square) && <span className="absolute inset-0 outline-3 -outline-offset-3 outline-accent" />}
              {isSel && <span className="absolute inset-0 outline-3 -outline-offset-3 outline-accent" />}
              {mustSet.has(square) && (
                <span
                  key={flashMust}
                  className={`absolute inset-[6%] rounded-full outline-2 outline-accent ${flashMust ? 'animate-[chip-shake_140ms_ease-in-out_2]' : ''}`}
                />
              )}
              {hints && target && !piece && <TargetMark step={target} />}
              {showX && <Coord pos="x" value={xOf(square)} light />}
              {showY && <Coord pos="y" value={yOf(square)} light />}
            </button>
          );
        })}
      </div>

      {/* Chips */}
      <div className="pointer-events-none absolute inset-0">
        {last?.captured && last.captureSquare !== null && (
          <div key={`ghost-${last.key}`} className="absolute top-0 left-0 size-[12.5%]" style={chipStyle(last.captureSquare, orientation)}>
            <div className="size-full p-[6%]">
              <div className="size-full animate-[fade-out_220ms_ease-in_forwards]">
                <Chip piece={last.captured} set={pieceSet} />
              </div>
            </div>
          </div>
        )}
        {pieces.map(({ piece, square }) => {
          const dragging = drag?.square === square;
          const style: CSSProperties = dragging
            ? { transform: `translate(calc(${drag.x}px - 50%), calc(${drag.y}px - 50%)) scale(1.08)`, zIndex: 20 }
            : chipStyle(square, orientation);
          return (
            <div
              key={piece.id}
              className={`absolute top-0 left-0 size-[12.5%] ${dragging || !motion ? '' : 'transition-transform duration-[180ms] ease-out'}`}
              style={style}
            >
              <div className="size-full p-[6%]">
                <div
                  key={shake?.square === square ? shake.n : 0}
                  className={`size-full ${shake?.square === square ? 'animate-[chip-shake_120ms_ease-in-out]' : ''}`}
                >
                  <Chip piece={piece} set={pieceSet} />
                </div>
              </div>
            </div>
          );
        })}
        {/* Score previews above the chips so they stay readable */}
        {hints &&
          targets
            .filter((t) => t.capture !== null)
            .map((t) => (
              <div key={`pv-${t.to}`} className="absolute top-0 left-0 size-[12.5%]" style={chipStyle(t.to, orientation)}>
                <div className="flex size-full items-end justify-center pb-[6%]">
                  <CapturePreview step={t} board={board} />
                </div>
              </div>
            ))}
      </div>
    </div>
  );
});

function squareName(square: number, op: Op, piece: Cell, s: { target: boolean; selected: boolean }) {
  const parts = [`(${xOf(square)},${yOf(square)})`, OP_NAME[op]];
  parts.push(piece ? `${SIDE_NAME[piece.side]} ${chipLabel(piece)}${piece.king ? ' dama' : ''}` : 'empty');
  if (s.selected) parts.push('selected');
  if (s.target) parts.push('move here');
  return parts.join(', ');
}

const GLYPH: Record<Op, string> = {
  add: 'M50 30v40M30 50h40',
  sub: 'M30 50h40',
  mul: 'M35.9 35.9l28.2 28.2M64.1 35.9 35.9 64.1',
  div: 'M30 50h40',
};

function OperatorGlyph({ op }: { op: Op }) {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
      <path d={GLYPH[op]} stroke="var(--sq-glyph)" strokeWidth="7" strokeLinecap="round" fill="none" />
      {op === 'div' && (
        <>
          <circle cx="50" cy="35" r="5" fill="var(--sq-glyph)" />
          <circle cx="50" cy="65" r="5" fill="var(--sq-glyph)" />
        </>
      )}
    </svg>
  );
}

function Coord({ pos, value, light }: { pos: 'x' | 'y'; value: number; light: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute text-[11px] leading-none font-semibold ${pos === 'x' ? 'right-[6%] bottom-[5%]' : 'top-[5%] left-[6%]'}`}
      style={{ color: light ? 'var(--sq-coord-light)' : 'var(--sq-coord-dark)' }}
    >
      {value}
    </span>
  );
}

function TargetMark({ step }: { step: LegalStep }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${step.capture !== null ? 'size-[34%] border-[3px] border-accent' : 'size-[28%] bg-accent'}`}
    />
  );
}

function CapturePreview({ step, board }: { step: LegalStep; board: readonly Cell[] }) {
  const attacker = board[step.from];
  const captured = step.capture !== null ? board[step.capture] : null;
  if (!attacker || !captured) return null;
  const eq = scoreCapture(attacker, captured, OPERATORS[step.to]!);
  const scored = eq.base !== null;
  return (
    <span
      className={`rounded-full px-1.5 text-[11px] leading-[16px] font-semibold whitespace-nowrap ${scored ? 'bg-accent text-accent-ink' : 'bg-black/70 text-white'}`}
    >
      {scored ? `+₱${eq.points}` : 'NS'}
    </span>
  );
}
