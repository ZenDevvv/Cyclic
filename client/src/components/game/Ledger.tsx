// The capture ledger: the move list written as the equations each capture scored.
import { useEffect, useMemo, useRef } from 'react';
import type { Grade, Side, StepRecord } from '../../../../shared/engine.ts';
import { chipLabel, coord, equationParts, scoringGuide } from '../../../../shared/notation.ts';
import { SideDot } from '../ui/controls.tsx';
import { MathText } from '../ui/MathText.tsx';

interface Turn {
  turn: number;
  side: Side;
  steps: StepRecord[];
}

function groupTurns(records: readonly StepRecord[]): Turn[] {
  const out: Turn[] = [];
  for (const r of records) {
    const last = out[out.length - 1];
    if (last && last.turn === r.turn) last.steps.push(r);
    else out.push({ turn: r.turn, side: r.side, steps: [r] });
  }
  return out;
}

interface Props {
  records: readonly StepRecord[];
  grade?: Grade;
  /** Replay: index of the step being shown (−1 = start). Clicking a step selects it. */
  current?: number;
  onSelect?: (index: number) => void;
  emptyText?: string;
  className?: string;
}

export function Ledger({ records, grade = 7, current, onSelect, emptyText = 'No moves yet. Red moves first.', className = '' }: Props) {
  const turns = useMemo(() => groupTurns(records), [records]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (current !== undefined) {
      // Scroll the panel only; scrollIntoView would also scroll the page.
      const row = el.querySelector<HTMLElement>('[data-current="true"]');
      if (!row) return;
      const top = row.offsetTop;
      if (top < el.scrollTop) el.scrollTop = top - 8;
      else if (top + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + row.offsetHeight - el.clientHeight + 8;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [records.length, current]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={`scrollbar-thin relative overflow-y-auto ${className}`}
      aria-label="Moves and captures"
      role="log"
    >
      {turns.length === 0 ? (
        <div className="py-3">
          <p className="text-body text-muted">{emptyText}</p>
          <ScoringGuide grade={grade} />
        </div>
      ) : (
        <ol className="flex flex-col">
          {turns.map((t) => (
            <li key={t.turn} className="flex gap-3 border-b border-rule py-2 last:border-b-0">
              <span className="num w-6 flex-none pt-0.5 text-right text-meta text-faint">{t.turn}</span>
              <SideDot side={t.side} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                {t.steps.map((r) => (
                  <StepLine key={r.index} r={r} current={current === r.index} onSelect={onSelect} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Shown while the ledger is empty: how a capture scores, in the ledger's own format. */
function ScoringGuide({ grade }: { grade: Grade }) {
  const { equations, note } = scoringGuide(grade);
  return (
    <div className="mt-5">
      <p className="mb-1 text-meta text-faint">How a capture scores: the sign under the landing square combines the two chips.</p>
      <ul>
        {equations.map((equation) => {
          const eq = equationParts(equation);
          return (
            <li key={eq.left} className="num flex items-baseline justify-between gap-3 border-b border-rule py-1.5 text-body last:border-b-0">
              <span className="min-w-0 text-muted">
                <MathText>{`${eq.left} = ${eq.result}${eq.factors.length > 0 ? ` · ${eq.factors.join(' · ')}` : ''}`}</MathText>
              </span>
              <span className={eq.scored ? 'flex-none font-semibold text-accent' : 'flex-none text-meta text-faint'}>
                <MathText>{eq.scored ? `+${eq.points}` : eq.reason!}</MathText>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-meta text-faint">{note} The lowest total wins.</p>
    </div>
  );
}

function StepLine({ r, current, onSelect }: { r: StepRecord; current: boolean; onSelect?: (i: number) => void }) {
  const eq = r.equation ? equationParts(r.equation) : null;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium text-ink">
            <MathText>{chipLabel(r.piece)}</MathText>
          </span>
          {r.piece.king && <span className="text-muted"> dama</span>}
          <span className="num text-muted">
            {' '}
            {coord(r.from)}→{coord(r.to)}
          </span>
          {r.crowned && <span className="text-ink"> · crowned</span>}
          {r.forced && <span className="text-faint"> · forced</span>}
        </span>
      </span>
      {eq && (
        <span className="mt-0.5 flex items-baseline justify-between gap-3">
          <span className="num min-w-0 text-muted">
            <MathText>{`${eq.left} = ${eq.result}`}</MathText>
            {eq.factors.length > 0 && <span className="text-faint"> · {eq.factors.join(' · ')}</span>}
          </span>
          {eq.scored ? (
            <span className="num flex-none font-semibold text-accent">
              <MathText>{`+${eq.points}`}</MathText>
            </span>
          ) : (
            <span className="flex-none text-meta text-faint">{eq.reason}</span>
          )}
        </span>
      )}
    </>
  );
  if (!onSelect) return <span className="block py-0.5 text-body">{body}</span>;
  return (
    <button
      type="button"
      data-current={current}
      onClick={() => onSelect(r.index)}
      className={`-mx-2 block w-[calc(100%+16px)] rounded-chip px-2 py-0.5 text-left text-body ${current ? 'bg-active' : 'hover:bg-raised'}`}
    >
      {body}
    </button>
  );
}
