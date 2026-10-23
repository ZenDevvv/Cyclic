import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'neutral' | 'negative' | 'positive';
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (text: string, opts?: Partial<Omit<Toast, 'id' | 'text'>> & { ms?: number }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (text, opts = {}) => {
    const id = ++seq;
    const toast: Toast = { id, text, tone: opts.tone ?? 'neutral', action: opts.action };
    set({ toasts: [...get().toasts.slice(-2), toast] });
    setTimeout(() => get().dismiss(id), opts.ms ?? 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, opts?: Parameters<ToastStore['push']>[1]) => useToasts.getState().push(text, opts);
