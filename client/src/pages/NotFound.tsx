import { useMemo } from 'react';
import { initialBoard, sq } from '../../../shared/engine.ts';
import { Board } from '../components/board/Board.tsx';
import { ButtonLink } from '../components/ui/Button.tsx';
import { useTitle } from '../lib/useTitle.ts';

export default function NotFound() {
  useTitle('Not found');
  const board = useMemo(() => initialBoard(), []);
  return (
    <div className="column grid items-start gap-6 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="rounded-card bg-surface p-5.5">
        <h1 className="text-title">Nothing on this square</h1>
        <p className="mt-2 text-body text-muted">That page does not exist. Room links look like /room/K7Q2MX.</p>
        <div className="mt-5 flex gap-2">
          <ButtonLink to="/play" variant="primary">
            Go to the lobby
          </ButtonLink>
          <ButtonLink to="/learn">How to play</ButtonLink>
        </div>
      </div>
      <div className="rounded-card bg-surface p-3.5">
        <Board board={board} orientation="red" highlight={[sq(3, 4)]} label="An empty square, marked" />
      </div>
    </div>
  );
}
