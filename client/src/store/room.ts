// The room this tab is looking at: snapshots merged with step history and chat.
import { create } from 'zustand';
import type { StepRecord } from '../../../shared/engine.ts';
import type { ChatMessage, ErrorCode, RoomSnapshot } from '../../../shared/protocol.ts';

export interface RoomError {
  code: ErrorCode;
  message: string;
  roomCode?: string;
}

interface RoomStore {
  /** Room code this tab wants to be in (set by the Room page). */
  code: string | null;
  snap: RoomSnapshot | null;
  records: StepRecord[];
  chat: ChatMessage[];
  unread: number;
  role: 'player' | 'spectator' | null;
  error: RoomError | null;
  closed: string | null;
}

export const useRoom = create<RoomStore>(() => ({
  code: null,
  snap: null,
  records: [],
  chat: [],
  unread: 0,
  role: null,
  error: null,
  closed: null,
}));

/** Merge a snapshot. Returns false when history has a gap and a full sync is needed. */
export function applySnapshot(snap: RoomSnapshot): boolean {
  const cur = useRoom.getState();
  if (cur.code && snap.code !== cur.code) return true; // a room we are no longer viewing
  let records = cur.records;
  let chat = cur.chat;
  let ok = true;
  const sameRoom = cur.snap?.code === snap.code;
  if (snap.full) {
    records = snap.game?.records ?? [];
    chat = snap.chat ?? [];
  } else if (!sameRoom) {
    ok = false;
  } else if (snap.game) {
    const count = snap.game.state.stepCount;
    if (count === 0) records = [];
    else if (count === records.length) {
      // already up to date
    } else if (count === records.length + 1 && snap.game.lastStep?.index === records.length) {
      records = [...records, snap.game.lastStep];
    } else {
      ok = false;
    }
  }
  useRoom.setState({ snap, records, chat, closed: null });
  return ok;
}

export function addChat(msg: ChatMessage, viewingChat: boolean): void {
  const cur = useRoom.getState();
  if (cur.chat.some((m) => m.id === msg.id)) return;
  useRoom.setState({
    chat: [...cur.chat.slice(-99), msg],
    unread: viewingChat || msg.role === 'system' ? cur.unread : cur.unread + 1,
  });
}

export function resetRoom(code: string | null): void {
  useRoom.setState({ code, snap: null, records: [], chat: [], unread: 0, role: null, error: null, closed: null });
}
