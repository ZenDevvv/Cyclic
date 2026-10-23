// The title screen. One motif: the notched chip of the original artwork, a screen wide, whose face is a
// window onto a game that plays itself (attract mode). A game-style menu sends players on.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { replay, scoreCapture, xOf, yOf, type StepRecord } from '../../../shared/engine.ts';
import { equationParts } from '../../../shared/notation.ts';
import { encodeBoard } from '../../../shared/codec.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { MiniBoard } from '../components/board/MiniBoard.tsx';
import { ChipCursor, GiantChip } from '../components/title/GiantChip.tsx';
import { useAttractGame } from '../components/title/useAttractGame.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { SideDot } from '../components/ui/controls.tsx';
import { play } from '../lib/sound.ts';
import { useTitle } from '../lib/useTitle.ts';
import { useLobby } from '../store/lobby.ts';

type Preview = 'game' | 'room' | 'rules';

interface MenuItem {
  id: string;
  label: string;
  meta: string;
  to: string;
  state?: unknown;
  preview: Preview;
  caption?: string;
}

export default function Title() {
  useTitle('');
  const hero = useRef<HTMLElement>(null);
  const game = useAttractGame(hero);
  const navigate = useNavigate();
  const presence = useLobby((s) => s.presence);
  const liveGames = presence ? Math.floor(presence.playing / 2) : 0;
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);

  const menu: MenuItem[] = [
    { id: 'quick', label: 'Quick match', meta: 'Rated, starts in seconds', to: '/play', state: { quick: 'standard' }, preview: 'game', caption: 'Matched near your rating' },
    { id: 'friend', label: 'Play a friend', meta: 'Invite link', to: '/play', state: { create: true }, preview: 'room' },
    { id: 'bot', label: 'Play the bot', meta: 'Three levels', to: '/play/bot', preview: 'game', caption: 'Bot against bot, live' },
    { id: 'learn', label: 'How to play', meta: 'Five minutes', to: '/learn', preview: 'rules' },
    { id: 'watch', label: 'Watch', meta: liveGames ? `${liveGames} live now` : 'Live games', to: '/watch', preview: 'game', caption: 'Public games, live' },
  ];
  const current = menu[active];

  // A game title menu: arrow keys move the chip cursor, Enter starts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, dialog, [role="dialog"]')) return;
      const inMenu = !!target.closest('[data-title-menu]');
      if (!inMenu && target !== document.body) return;
      const rect = hero.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 120) return; // only while the title is on screen
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => {
          const next = (i + (e.key === 'ArrowDown' ? 1 : menu.length - 1)) % menu.length;
          rows.current[next]?.focus();
          return next;
        });
      } else if (e.key === 'Enter' && target === document.body) {
        e.preventDefault();
        rows.current[active]?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, menu.length]);

  // Pointer parallax for the spilled chips; written to CSS variables so React does not re-render.
  const onPointerMove = (e: ReactPointerEvent) => {
    const el = hero.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };

  const takeOver = () => {
    const steps = game.takeoverSteps;
    const s = replay(steps).state;
    if (!s.result) {
      try {
        localStorage.setItem('scidama.local.bot', JSON.stringify({ steps, level: 'medium', you: s.turn, resigned: null }));
      } catch {
        // Storage blocked: the bot page starts a fresh game instead.
      }
    }
    play('move');
    navigate('/play/bot');
  };

  const { state } = game;
  const last = game.records[game.records.length - 1] ?? null;

  return (
    <>
      <section
        ref={hero}
        onPointerMove={onPointerMove}
        aria-labelledby="title-h1"
        className="relative overflow-hidden lg:min-h-[calc(100svh-48px)]"
        style={
          {
            ['--d' as string]: 'min(820px, calc(100svh - 8px), 60vw)',
            // The page's right margin, the same one the column uses.
            ['--m' as string]: 'max(24px, calc((100vw - 1152px) / 2))',
          } as CSSProperties
        }
      >
        <div className="column pointer-events-none relative z-10 flex flex-col pt-8 pb-10 lg:min-h-[calc(100svh-48px)] lg:justify-center lg:py-12 [&>*]:pointer-events-auto">
          <div className="lg:max-w-[440px]">
            <h1
              id="title-h1"
              className="text-[clamp(64px,8vw,115px)] leading-[0.92] font-semibold tracking-[-0.045em] motion-safe:animate-[rise-in_700ms_cubic-bezier(.2,.8,.2,1)_both]"
            >
              Scidama
            </h1>
            <p className="mt-5 max-w-[34ch] text-[18px] leading-[28px] text-ink motion-safe:animate-[rise-in_700ms_cubic-bezier(.2,.8,.2,1)_120ms_both]">
              Checkers where every capture is a sum. Chips are pesos or kilowatt-hours, and only like units score.
            </p>
          </div>

          <nav aria-label="Start" data-title-menu className="mt-8 lg:mt-10 lg:max-w-[440px]">
            <ul className="flex flex-col">
              {menu.map((m, i) => (
                <li key={m.id} className="motion-safe:animate-[rise-in_600ms_cubic-bezier(.2,.8,.2,1)_both]" style={{ animationDelay: `${220 + i * 70}ms` }}>
                  <Link
                    ref={(el) => {
                      rows.current[i] = el;
                    }}
                    to={m.to}
                    state={m.state}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => play('move')}
                    aria-describedby={`menu-meta-${m.id}`}
                    className={`group -ml-1 flex min-h-12 items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 transition-colors duration-150 ${i === active ? 'bg-white text-black' : 'text-muted hover:text-ink'}`}
                  >
                    <span
                      className={`flex size-[26px] flex-none items-center justify-center transition-[opacity,scale] duration-200 ${i === active ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                    >
                      <ChipCursor size={22} className={i === active ? 'motion-safe:animate-[spin_6s_linear_infinite]' : ''} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center">
                      <span className="text-[22px] leading-[28px] font-semibold tracking-[-0.02em] sm:text-[26px] sm:leading-[32px]">{m.label}</span>
                      <span
                        id={`menu-meta-${m.id}`}
                        className={`text-[13px] leading-[18px] whitespace-nowrap sm:ml-auto sm:pl-4 ${i === active ? 'text-black/70' : 'text-faint'}`}
                      >
                        {m.meta}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 hidden pl-[30px] text-[13px] text-faint [@media(hover:hover)]:block">Press Enter to start · ↑ ↓ to choose</p>
          </nav>

          {/* On phones and tablets the chip follows the menu, so the way in stays on the first screen. */}
          <div className="relative -mx-[14vw] mt-10 mb-2 sm:mx-auto sm:w-[min(640px,100%)] lg:hidden motion-safe:animate-[chip-in_1100ms_cubic-bezier(.2,.8,.2,1)_both]">
            <HeroChip game={game} current={current} last={last} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 motion-safe:animate-[rise-in_600ms_ease-out_650ms_both] lg:max-w-[440px]" aria-live="off">
            <p className="num text-[18px] leading-[28px] text-muted">
              <span className="text-ink">Demo game</span> · <SideDot side="red" className="mr-1" />
              ₱{state.scores.red} · <SideDot side="blue" className="mr-1" />₱{state.scores.blue}
              {state.result ? ' · finished' : ` · ${state.turn} to move`}
            </p>
            <Button variant="secondary" onClick={takeOver} disabled={!!state.result}>
              Play from here
            </Button>
          </div>
        </div>

        {/* Desktop: the chip a screen wide, cropped by the right edge. */}
        <div
          className="pointer-events-none absolute top-1/2 hidden lg:block"
          // The chip's face (62% of it) ends on the page's right margin; the ring bleeds past the edge.
          style={{ width: 'var(--d)', right: 'calc(var(--m) - var(--d) * 0.19)', transform: 'translateY(-50%)' }}
        >
          <div className="pointer-events-auto motion-safe:animate-[chip-in_1100ms_cubic-bezier(.2,.8,.2,1)_both]">
            <HeroChip game={game} current={current} last={last} />
          </div>
        </div>
      </section>

      <RimBand />
      <FlowSection />
      <WaysSection board={encodeBoard(state.board)} />
    </>
  );
}

// ---------------------------------------------------------------- the chip and what shows through it

function HeroChip({ game, current, last }: { game: ReturnType<typeof useAttractGame>; current: MenuItem; last: StepRecord | null }) {
  const mark: BoardMark | null = last ? { from: last.from, to: last.to, captureSquare: last.captureSquare, captured: last.captured, key: last.index } : null;
  return (
    <div className="relative">
      <GiantChip spinning={game.running}>
        <div className="absolute inset-0">
          <Board board={game.state.board} orientation="red" last={mark} hints={false} coordinates={false} label="Demo game, playing itself" className="!rounded-none" />
          <CapturePops records={game.records} />
        </div>
        <Face show={current.preview === 'room'}>
          <RoomPreview />
        </Face>
        <Face show={current.preview === 'rules'}>
          <RulesPreview />
        </Face>
        {current.preview === 'game' && current.caption && (
          <p key={current.id} className="animate-sheet absolute bottom-[15%] left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-center text-[13px] whitespace-nowrap text-white @max-sm:hidden">
            {current.caption}
          </p>
        )}
      </GiantChip>
      <SpilledChips />
    </div>
  );
}

/** A preview swapped into the chip's face with a circular wipe (the motif again). */
function Face({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!show}
      className="absolute inset-0 bg-[var(--sq-dark)] transition-[clip-path] duration-[320ms] ease-out motion-reduce:transition-none"
      style={{ clipPath: show ? 'circle(75% at 50% 50%)' : 'circle(0% at 50% 50%)' }}
    >
      {children}
    </div>
  );
}

interface Pop {
  key: number;
  left: string;
  top: string;
  text: string;
  points: string | null;
}

/** Each capture in the demo rises off its landing square as the sum it scored. */
function CapturePops({ records }: { records: StepRecord[] }) {
  const [pops, setPops] = useState<Pop[]>([]);
  const seen = useRef(records.length);
  useEffect(() => {
    if (records.length < seen.current) seen.current = 0; // a new game was dealt
    const fresh = records.slice(seen.current).filter((r) => r.captured && r.equation);
    seen.current = records.length;
    if (!fresh.length) return;
    const add = fresh.map((r) => {
      const p = equationParts(r.equation!);
      return {
        key: r.index + Math.random(),
        // Kept toward the middle so the round face never clips a sum.
        left: `${Math.min(70, Math.max(30, ((xOf(r.to) + 0.5) / 8) * 100))}%`,
        top: `${Math.min(76, Math.max(26, ((7 - yOf(r.to) + 0.5) / 8) * 100))}%`,
        text: `${p.left} = ${p.result}`,
        points: p.scored ? `+₱${r.points}` : null,
      };
    });
    setPops(add.slice(-1)); // one sum at a time keeps the face readable
    const keys = new Set(add.map((a) => a.key));
    const t = setTimeout(() => setPops((ps) => ps.filter((p) => !keys.has(p.key))), 2400);
    return () => clearTimeout(t);
  }, [records]);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {pops.map((p) => (
        <span
          key={p.key}
          className="absolute flex animate-[pop-rise_2400ms_ease-out_forwards] items-center gap-2 rounded-full bg-black/80 py-1 pr-1 pl-3 text-[13px] whitespace-nowrap text-white"
          style={{ left: p.left, top: p.top }}
        >
          <span className="num @max-sm:hidden">{p.text}</span>
          {p.points ? (
            <span className="num rounded-full bg-accent px-2 font-semibold text-accent-ink">{p.points}</span>
          ) : (
            <span className="pr-2 text-muted">
              <span className="@max-sm:hidden">no score</span>
              <span className="@sm:hidden">NS</span>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function RoomPreview() {
  const code = 'K7Q2MX';
  return (
    <div data-ui className="flex size-full flex-col items-center justify-center gap-[5%] p-[14%] text-center text-[var(--sq-light)]">
      <p className="text-[clamp(13px,2.6cqw,16px)] text-[var(--sq-light)]/80">Your room</p>
      <div className="flex gap-[1.5%]" aria-label={`Room code ${code}`}>
        {code.split('').map((ch, i) => (
          <span
            key={i}
            className="flex aspect-square w-[clamp(28px,11cqw,60px)] items-center justify-center rounded-full border-[3px] bg-[var(--chip-face)] text-[clamp(15px,5.4cqw,30px)] font-semibold text-[var(--chip-ink)]"
            style={{ borderColor: i % 2 ? 'var(--blue-chip)' : 'var(--red-chip)' }}
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="flex w-[min(100%,300px)] flex-col gap-2 text-left text-[clamp(13px,2.8cqw,16px)]">
        <p className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5">
          <SideDot side="red" /> You <span className="ml-auto text-[var(--sq-light)]/70">host</span>
        </p>
        <p className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5">
          <SideDot side="blue" /> Your friend <span className="ml-auto text-[var(--sq-light)]/70">joining…</span>
        </p>
      </div>
    </div>
  );
}

const RULE_EXAMPLES = (() => {
  const p = (unit: 'P' | 'kWh', value: number) => ({ id: 'x', side: 'red' as const, unit, value, king: false });
  return [
    scoreCapture(p('P', 8), p('P', 4), 'add'),
    scoreCapture(p('kWh', 5), p('kWh', 3), 'add'),
    scoreCapture(p('P', 8), p('P', 4), 'mul'),
    scoreCapture(p('P', 8), p('kWh', 3), 'add'),
  ].map(equationParts);
})();

function RulesPreview() {
  return (
    <div data-ui className="flex size-full flex-col items-center justify-center p-[15%] text-[var(--sq-light)]">
      <p className="text-[clamp(16px,4.6cqw,26px)] font-semibold tracking-[-0.02em]">Only like units score</p>
      <ul className="mt-[5%] flex w-full max-w-[330px] flex-col gap-1.5">
        {RULE_EXAMPLES.map((e) => (
          <li key={e.left} className="num flex items-center justify-between gap-3 rounded-full bg-black/35 py-1 pr-1 pl-3 text-[clamp(13px,2.8cqw,16px)]">
            <span className="truncate">{e.left}</span>
            {e.scored ? (
              <span className="rounded-full bg-accent px-2 font-semibold text-accent-ink">{e.points}</span>
            ) : (
              <span className="pr-2 text-[var(--sq-light)]/70">no score</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- the original chip art, spilled

const SPILLED = [
  { src: '/art/red-p8.webp', label: '₱8', style: { left: '0%', top: '64%', width: '19%' }, rot: -14, depth: 12 },
  { src: '/art/blue-kwh5.webp', label: '5 kWh', style: { left: '7%', top: '3%', width: '14%' }, rot: 17, depth: 10 },
  { src: '/art/red-kwh11.webp', label: '11 kWh', style: { left: '27%', top: '84%', width: '15%' }, rot: 7, depth: 22 },
] as const;

function SpilledChips() {
  const [tossed, setTossed] = useState<Record<number, number>>({});
  return (
    <>
      {SPILLED.map((c, i) => (
        <button
          key={c.src}
          type="button"
          aria-label={`Toss the ${c.label} chip`}
          onClick={() => {
            setTossed((t) => ({ ...t, [i]: Date.now() }));
            play(i === 1 ? 'kingMove' : 'move');
          }}
          className="absolute aspect-square rounded-full transition-transform duration-300 ease-out hover:scale-105"
          style={{
            ...c.style,
            transform: `translate(calc(var(--px, 0) * ${c.depth}px), calc(var(--py, 0) * ${c.depth}px)) rotate(${c.rot}deg)`,
          }}
        >
          <span className="block size-full motion-safe:animate-[drop-in_800ms_cubic-bezier(.3,1.4,.5,1)_both]" style={{ animationDelay: `${500 + i * 140}ms` }}>
          <img
            key={tossed[i] ?? 0}
            src={c.src}
            alt=""
            draggable={false}
            className={`block size-full ${tossed[i] ? 'motion-safe:animate-[chip-toss_700ms_cubic-bezier(.2,.8,.3,1)]' : ''}`}
          />
          </span>
        </button>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- entrances below the fold

/** Parts of a section rise in, staggered, the first time they scroll into view. */
function Reveal({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-[opacity,translate] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- the rim, unrolled

function RimBand() {
  const tile = (
    <svg width="960" height="28" viewBox="0 0 960 28" aria-hidden="true" className="block flex-none">
      <rect width="960" height="28" fill="var(--accent)" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={i * 48 + 18} y="7" width="12" height="14" rx="3" fill="var(--ground)" />
      ))}
    </svg>
  );
  return (
    <div aria-hidden="true" className="overflow-hidden">
      <div className="flex w-max motion-safe:animate-[rim-roll_36s_linear_infinite]">
        {tile}
        {tile}
        {tile}
        {tile}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- how it works: one bar

const STAGES = [
  { grow: 16, tone: 'bg-accent text-accent-ink', time: 'Seconds', clause: 'First, pick quick match, a room or the bot.' },
  { grow: 16, tone: 'bg-[var(--blue-chip)] text-white', time: 'Under a minute', clause: 'Then a player near your rating sits down.' },
  { grow: 68, tone: 'bg-[var(--sq-dark)] text-[var(--sq-light)]', time: 'Twenty minutes', clause: 'Finally, sixty seconds a move until the chips or the clock run out.' },
];

function FlowSection() {
  return (
    <section aria-labelledby="flow-h" className="column pt-28 pb-24 lg:pt-40 lg:pb-32">
      <Reveal>
        <h2 id="flow-h" className="text-[clamp(40px,4.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.035em] text-pretty">
          From title screen to table
        </h2>
      </Reveal>
      <div data-ui className="mt-16 flex flex-col gap-1.5 lg:h-[22vh] lg:min-h-[180px] lg:flex-row">
        {STAGES.map((s, i) => (
          <Reveal key={s.time} delay={90 + i * 90} className="flex lg:min-h-0" style={{ flexGrow: s.grow, flexBasis: 0 }}>
            <div className={`flex min-h-[96px] w-full flex-col justify-between rounded-[22px] p-5 lg:min-h-0 ${s.tone}`}>
              <p className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em]">{s.time}</p>
              <p className="mt-3 text-[18px] leading-[26px] lg:hidden">{s.clause}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-4 hidden gap-1.5 lg:flex">
        {STAGES.map((s, i) => (
          <Reveal key={s.time} delay={180 + i * 90} style={{ flexGrow: s.grow, flexBasis: 0 }}>
            <p className="pr-4 text-[18px] leading-[26px] text-muted">{s.clause}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ways to play: a paragraph with picture words

function Slot({ children, wide, label }: { children: ReactNode; wide?: boolean; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`mx-[0.08em] inline-flex h-[1em] items-center justify-center overflow-hidden rounded-full bg-raised align-[-0.14em] ${wide ? 'w-[2.6em]' : 'w-[1.9em]'}`}
    >
      {children}
    </span>
  );
}

function WaysSection({ board }: { board: string }) {
  return (
    <section aria-labelledby="ways-h" className="column pb-28 lg:pb-40">
      <h2 id="ways-h" className="sr-only">
        Ways to play
      </h2>
      <Reveal>
      <p className="max-w-[40ch] text-[22px] leading-[1.3] font-medium tracking-[-0.015em] sm:text-[clamp(24px,2.6vw,34px)] sm:leading-[1.28]">
        Meet a stranger at your level{' '}
        <Slot label="A red and a blue chip from the original artwork">
          <img src="/art/red-p2.webp" alt="" className="h-full" />
          <img src="/art/blue-kwh9.webp" alt="" className="-ml-[0.25em] h-full" />
        </Slot>
        , send a friend a code{' '}
        <Slot wide label="Room code K7Q2MX">
          <span className="text-[max(13px,0.53em)] font-semibold text-ink">K7Q2MX</span>
        </Slot>{' '}
        or practise with the bot{' '}
        <Slot label="A board in play">
          <span className="block h-full overflow-hidden rounded-full">
            <MiniBoard code={board} size={64} label="A board in play" />
          </span>
        </Slot>
        . Every capture is a sum{' '}
        <span className="mx-[0.08em] inline-flex h-[1em] items-center rounded-full bg-accent px-[0.4em] align-[-0.14em] text-[max(13px,0.53em)] font-semibold text-accent-ink">
          +₱12
        </span>
        .
      </p>
      </Reveal>
      <div className="mt-[72px] grid lg:grid-cols-12">
        <Reveal delay={120} className="lg:col-span-6 lg:col-start-7">
          <p className="text-[18px] leading-[28px] text-ink">
            Scidama adds pesos and kilowatt-hours to Damath, the math checkers created by Jesus Huenda, a teacher in Sorsogon. The first
            Damath tournament was held there in 1980.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink to="/play" variant="primary">
              Play Scidama
            </ButtonLink>
            <ButtonLink to="/learn" variant="ghost">
              Read the rules
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
