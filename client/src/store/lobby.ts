import { create } from 'zustand';
import type { LobbyState, QueueState } from '../../../shared/protocol.ts';

interface LobbyStore {
  lobby: LobbyState | null;
  queue: QueueState;
  presence: { online: number; playing: number } | null;
  /** Unfinished room this user sits in (from the server on connect). */
  seatCode: string | null;
  connection: 'connecting' | 'online' | 'offline';
  /** serverNow − Date.now(), so clocks match the server. */
  offset: number;
}

export const useLobby = create<LobbyStore>(() => ({
  lobby: null,
  queue: { preset: null, since: null, waiting: 0 },
  presence: null,
  seatCode: null,
  connection: 'connecting',
  offset: 0,
}));

export const serverNow = () => Date.now() + useLobby.getState().offset;
