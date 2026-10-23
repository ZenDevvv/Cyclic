import { Link } from 'react-router';
import type { Side } from '../../../../shared/engine.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { SideDot } from '../ui/controls.tsx';
import { Icon } from '../ui/Icon.tsx';
import { clock, peso } from '../../lib/format.ts';

export interface PlayerInfo {
  id?: string;
  name: string;
  rating?: number | null;
  /** "You", "Bot · hard", "Host"… */
  tag?: string;
  bot?: boolean;
  connected?: boolean;
  forfeitAt?: number | null;
}

interface Props {
  side: Side;
  player: PlayerInfo | null;
  score: number;
  toMove: boolean;
  /** Remaining move time in ms for the side to move, or null. */
  moveLeft: number | null;
  /** Move-time setting in seconds, shown dimmed when it is not this side's turn. */
  moveSeconds: number;
  now: number;
  over: boolean;
}

export function PlayerStrip({ side, player, score, toMove, moveLeft, moveSeconds, now, over }: Props) {
  const active = toMove && !over;
  const low = active && moveLeft !== null && moveLeft < 10_000;
  const away = player && player.connected === false;
  return (
    <div className={`flex items-center gap-3 rounded-panel px-3 py-2.5 transition-colors ${active ? 'bg-raised' : 'bg-surface'}`}>
      {player?.id ? (
        <Avatar id={player.id} name={player.name} size={32} />
      ) : (
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-ground text-muted" aria-hidden="true">
          <Icon name={player?.bot ? 'bot' : 'user'} size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SideDot side={side} />
          {player?.id ? (
            <Link to={`/player/${player.id}`} className={`truncate font-semibold hover:underline ${active ? 'text-ink' : 'text-muted'}`}>
              {player.name}
            </Link>
          ) : (
            <span className={`truncate font-semibold ${active ? 'text-ink' : 'text-muted'}`}>{player?.name ?? 'Empty seat'}</span>
          )}
          {player?.rating ? <span className="num text-meta text-faint">{player.rating}</span> : null}
        </div>
        <p className="truncate text-meta text-muted">
          {away ? (
            <span className="text-warning">
              Disconnected{player?.forfeitAt ? ` · ${clock(player.forfeitAt - now)} to return` : ''}
            </span>
          ) : active ? (
            `${player?.tag ? `${player.tag} · ` : ''}to move`
          ) : (
            player?.tag ?? (side === 'red' ? 'Red' : 'Blue')
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-figure font-semibold">{peso(score)}</p>
      </div>
      {moveSeconds > 0 && (
        <div
          role="timer"
          className={`num flex h-11 w-[76px] flex-none items-center justify-center rounded-panel text-[22px] font-semibold ${active ? 'bg-ground' : ''} ${low ? 'text-negative' : active ? 'text-ink' : 'text-faint'}`}
          aria-label={active && moveLeft !== null ? `Move clock ${clock(moveLeft)}` : `${moveSeconds} seconds a move`}
        >
          {active && moveLeft !== null ? clock(moveLeft) : clock(moveSeconds * 1000)}
        </div>
      )}
    </div>
  );
}
