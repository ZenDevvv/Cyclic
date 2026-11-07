import { Link } from 'react-router';
import { gradeName, scoreText } from '../../../shared/notation.ts';
import type { GameSummary } from '../../../shared/protocol.ts';
import { Pill } from './ui/controls.tsx';
import { MathText } from './ui/MathText.tsx';
import { relativeTime } from '../lib/format.ts';

export function GameRow({ game, meId }: { game: GameSummary; meId: string }) {
  const mySide = game.red.id === meId ? 'red' : 'blue';
  const opp = mySide === 'red' ? game.blue : game.red;
  const outcome = game.winner === null ? 'Draw' : game.winner === mySide ? 'Won' : 'Lost';
  const change = game.ratingChange ? game.ratingChange[mySide].after - game.ratingChange[mySide].before : null;
  return (
    <li className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0">
      <Pill tone={outcome === 'Won' ? 'positive' : outcome === 'Lost' ? 'negative' : 'neutral'}>{outcome}</Pill>
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="text-muted">vs </span>
          <Link to={`/player/${opp.id}`} className="font-medium hover:underline">
            {opp.name}
          </Link>
        </p>
        <p className="num text-body text-muted">
          <MathText>{`${scoreText(game.scores[mySide], game.grade)} to ${scoreText(game.scores[mySide === 'red' ? 'blue' : 'red'], game.grade)}`}</MathText> · {gradeName(game.grade)} ·{' '}
          {relativeTime(game.endedAt)}
          {change !== null && <span className={change > 0 ? 'text-positive' : change < 0 ? 'text-negative' : ''}> · {change > 0 ? `+${change}` : change}</span>}
        </p>
      </div>
      <Link to={`/game/${game.id}`} className="text-body text-muted hover:text-ink">
        Replay
      </Link>
    </li>
  );
}
