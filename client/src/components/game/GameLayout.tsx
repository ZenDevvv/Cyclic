// Board on the left and a 384px rail on the right; on phones the opponent sits above the board and
// you below it, with the panel after (the Lichess phone pattern). DESIGN.md §4.
import type { ReactNode } from 'react';

interface Props {
  header?: ReactNode;
  board: ReactNode;
  top: ReactNode;
  bottom: ReactNode;
  panel: ReactNode;
  actions?: ReactNode;
  banner?: ReactNode;
}

export function GameLayout({ header, board, top, bottom, panel, actions, banner }: Props) {
  return (
    <div className="column pt-4 pb-6 lg:pt-6">
      {header}
      <div
        className="grid grid-cols-1 gap-3.5 [grid-template-areas:'top'_'board'_'bottom'_'banner'_'actions'_'panel'] lg:h-[var(--board)] lg:grid-cols-[var(--board)_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] lg:[grid-template-areas:'board_top'_'board_banner'_'board_panel'_'board_bottom'_'board_actions']"
        style={{ ['--board' as string]: 'min(720px, calc(100dvh - 168px), calc(100vw - 48px - 398px))' }}
      >
        <div className="[grid-area:board] mx-auto w-full max-w-[min(100%,calc(100dvh-240px),720px)] self-start lg:mx-0 lg:max-w-none lg:w-[var(--board)]">
          {board}
        </div>
        <div className="[grid-area:top]">{top}</div>
        {banner ? <div className="[grid-area:banner]">{banner}</div> : <div className="hidden [grid-area:banner]" />}
        <div className="flex min-h-0 flex-col rounded-card bg-surface [grid-area:panel] max-lg:h-[340px]">{panel}</div>
        <div className="[grid-area:bottom]">{bottom}</div>
        {actions && <div className="flex flex-wrap items-center gap-2 [grid-area:actions]">{actions}</div>}
      </div>
    </div>
  );
}
