import { useState, type FormEvent } from 'react';
import { Dialog } from './ui/Dialog.tsx';
import { Field } from './ui/controls.tsx';
import { Button } from './ui/Button.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useSession } from '../store/session.ts';
import type { SessionResponse } from '../../../shared/protocol.ts';
import { toast } from '../store/toast.ts';

export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const adopt = useSession((s) => s.adopt);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api<SessionResponse>('/login', { method: 'POST', body: { name, password } });
      adopt(s);
      toast(`Signed in as ${s.me.name}.`);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sign in"
      description="Use the name and password you set on another device. This device's guest stays where it is."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          error={error}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            Sign in
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
