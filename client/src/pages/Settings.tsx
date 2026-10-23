// Settings in two columns: what a setting is on the left, the control (and its preview) on the right.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { applyStep, initialState, sq, type GameState } from '../../../shared/engine.ts';
import type { Me } from '../../../shared/protocol.ts';
import { Board, type BoardMark } from '../components/board/Board.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Field, Segmented, Switch } from '../components/ui/controls.tsx';
import { SignInDialog } from '../components/SignInDialog.tsx';
import { api, ApiError } from '../lib/api.ts';
import { play } from '../lib/sound.ts';
import { useTitle } from '../lib/useTitle.ts';
import { usePrefs, type BoardTheme, type PieceSet } from '../store/prefs.ts';
import { useSession } from '../store/session.ts';
import { toast } from '../store/toast.ts';

function Row({ title, description, children, aside }: { title: string; description: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid items-start gap-4 py-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-10" aria-label={title}>
      <div>
        <h2 className="text-card font-semibold">{title}</h2>
        <div className="mt-1 text-body text-muted">{description}</div>
        {aside && <div className="mt-4">{aside}</div>}
      </div>
      <div className="rounded-card bg-surface p-4 sm:p-5.5">{children}</div>
    </section>
  );
}

/** A mid-game position with a dama and a capture just made, for the board preview. */
function previewPosition(): { state: GameState; mark: BoardMark } {
  let s = initialState();
  const steps = [
    [sq(5, 2), sq(4, 3)],
    [sq(2, 5), sq(3, 4)],
    [sq(4, 3), sq(2, 5)],
  ] as const;
  let last = null as ReturnType<typeof applyStep>['record'] | null;
  for (const [from, to] of steps) {
    const r = applyStep(s, { from, to });
    s = r.state;
    last = r.record;
  }
  const board = s.board.slice();
  board[sq(7, 6)] = { id: 'demo-dama', side: 'red', unit: 'kWh', value: 11, king: true };
  board[sq(4, 1)] = null;
  return {
    state: { ...s, board },
    mark: { from: last!.from, to: last!.to, captureSquare: last!.captureSquare, captured: last!.captured, key: 'preview' },
  };
}

export default function Settings() {
  useTitle('Settings');
  const prefs = usePrefs();
  const preview = useMemo(previewPosition, []);
  return (
    <div className="column pt-6">
      <h1 className="text-title">Settings</h1>
      <p className="mt-1 text-body text-muted">Your name is shared with other players. Everything else is saved on this device.</p>

      <NameRow />
      <PasswordRow />

      <Row
        title="Board"
        description="How the board and the chips look. Flat chips are drawn for any size; Classic is the original Cyclic chip art."
        aside={
          <div className="max-w-[300px]">
            <Board board={preview.state.board} orientation="red" last={preview.mark} label="Board preview" />
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-body font-medium">Board colours</p>
            <Segmented<BoardTheme>
              label="Board colours"
              value={prefs.boardTheme}
              onChange={(v) => prefs.set({ boardTheme: v })}
              options={[
                { value: 'felt', label: 'Felt' },
                { value: 'slate', label: 'Slate' },
                { value: 'paper', label: 'Original' },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-body font-medium">Chips</p>
            <Segmented<PieceSet>
              label="Chips"
              value={prefs.pieceSet}
              onChange={(v) => prefs.set({ pieceSet: v })}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'classic', label: 'Classic' },
              ]}
            />
          </div>
          <div className="flex flex-col">
            <Switch checked={prefs.coordinates} onChange={(v) => prefs.set({ coordinates: v })} label="Coordinates" description="Numbers 0–7 on the board edges." />
            <Switch
              checked={prefs.hints}
              onChange={(v) => prefs.set({ hints: v })}
              label="Move hints"
              description="Mark legal squares, chips that must capture, and what each capture would score."
            />
            <Switch checked={prefs.motion} onChange={(v) => prefs.set({ motion: v })} label="Animate moves" description="Chips slide. Your system's reduced-motion setting always wins." />
          </div>
        </div>
      </Row>

      <Row title="Sound" description="The original Scidama sound effects for moves, captures, crowning and the end of a game.">
        <Switch checked={prefs.sound} onChange={(v) => prefs.set({ sound: v })} label="Sound effects" />
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="volume" className="text-body font-medium">
            Volume
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            disabled={!prefs.sound}
            onChange={(e) => prefs.set({ volume: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-[var(--text)] disabled:opacity-40"
          />
          <Button variant="secondary" icon="volume" disabled={!prefs.sound} onClick={() => play('capture')}>
            Test
          </Button>
        </div>
      </Row>

      <Row title="Games" description="Safety catches for online games.">
        <Switch checked={prefs.confirmResign} onChange={(v) => prefs.set({ confirmResign: v })} label="Ask before resigning" />
      </Row>
    </div>
  );
}

function NameRow() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState(me?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(me?.name ?? ''), [me?.name]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body: { name } }));
      toast('Name saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row title="Your name" description="Shown on the board, in chat and on the leaderboard. 3–20 characters.">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Name" value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} error={error} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim() || name.trim() === me?.name}>
            Save name
          </Button>
        </div>
      </form>
    </Row>
  );
}

function PasswordRow() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const signOut = useSession((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords differ.');
    setBusy(true);
    setError(null);
    try {
      setMe(await api<Me>('/me/password', { method: 'POST', body: { password } }));
      setPassword('');
      setConfirm('');
      toast('Password saved. Sign in elsewhere with your name and this password.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      title="Play on other devices"
      description={
        me?.hasPassword ? (
          <>This account has a password. Sign in on another device with “{me.name}” and that password.</>
        ) : (
          <>You are playing as a guest saved in this browser. Set a password to keep your rating if you clear it, and to sign in elsewhere.</>
        )
      }
      aside={
        <div className="-ml-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setSignIn(true)}>
            Sign in to another account
          </Button>
          {me?.hasPassword && (
            <Button variant="ghost" icon="logout" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </div>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field
          label={me?.hasPassword ? 'New password' : 'Password'}
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />
        <Field label="Repeat it" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" busy={busy} disabled={password.length < 8}>
            {me?.hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </div>
      </form>
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </Row>
  );
}
