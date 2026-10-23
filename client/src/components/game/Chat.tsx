import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '../../../../shared/protocol.ts';
import { request } from '../../lib/socket.ts';
import { toast } from '../../store/toast.ts';
import { SideDot } from '../ui/controls.tsx';

const QUICK = ['Good luck', 'Nice capture', 'Well played', 'Thanks for the game'];

export function Chat({ messages, canSend, className = '' }: { messages: ChatMessage[]; canSend: boolean; className?: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async (value: string) => {
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    const res = await request('chat:send', { text: t });
    setBusy(false);
    if (res.ok) setText('');
    else toast(res.message, { tone: 'negative' });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-2" role="log" aria-label="Chat">
        {messages.length === 0 && <p className="text-body text-muted">No messages yet.</p>}
        <ul className="flex flex-col gap-1.5">
          {messages.map((m) =>
            m.role === 'system' ? (
              <li key={m.id} className="text-meta text-faint">
                {m.text}
              </li>
            ) : (
              <li key={m.id} className="animate-row text-body break-words">
                <span className="mr-1.5 inline-flex items-center gap-1.5 font-semibold">
                  {m.role !== 'spectator' && <SideDot side={m.role} />}
                  {m.user.name}
                  {m.role === 'spectator' && <span className="font-normal text-faint">watching</span>}
                </span>
                <span className="text-muted">{m.text}</span>
              </li>
            ),
          )}
        </ul>
      </div>
      {canSend && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="h-8 flex-none rounded-full bg-raised px-3 text-meta text-muted hover:bg-active hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <label className="sr-only" htmlFor="chat-input">
              Message
            </label>
            <input
              id="chat-input"
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say something"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-full border border-control bg-ground px-4 text-body text-ink placeholder:text-faint focus:border-muted focus:outline-none"
            />
            <button type="submit" disabled={busy || !text.trim()} className="h-10 rounded-full bg-raised px-4 text-body font-medium hover:bg-active disabled:opacity-45">
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
