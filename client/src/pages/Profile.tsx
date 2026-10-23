import { useParams } from 'react-router';
import type { PlayerProfile } from '../../../shared/protocol.ts';
import { Avatar } from '../components/ui/Avatar.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { EmptyState, Panel, Skeleton } from '../components/ui/controls.tsx';
import { GameRow } from '../components/GameRow.tsx';
import { RatingChart } from '../components/RatingChart.tsx';
import { MISSING, plural, relativeTime } from '../lib/format.ts';
import { useApi } from '../lib/useApi.ts';
import { useTitle } from '../lib/useTitle.ts';
import { useSession } from '../store/session.ts';

export default function Profile() {
  const id = useParams().id!;
  const me = useSession((s) => s.me);
  const { data, error, loading, reload } = useApi<PlayerProfile>(`/players/${id}`);
  useTitle(data?.user.name ?? 'Player');

  if (loading && !data) {
    return (
      <div className="column pt-6" aria-busy="true">
        <Skeleton className="h-[88px] rounded-card" />
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-card lg:col-span-2" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="column pt-6">
        <h1 className="text-title">Player not found</h1>
        <div className="mt-4">
          <EmptyState action={<Button variant="ghost" onClick={reload}>Retry</Button>}>{error ?? 'No player with that id.'}</EmptyState>
        </div>
      </div>
    );
  }

  const u = data.user;
  const isMe = me?.id === u.id;
  const decided = u.wins + u.losses;
  const winRate = u.games ? Math.round((u.wins / u.games) * 100) : null;
  const peak = Math.max(...data.history.map((h) => h.rating));
  // Figures from the recent games on this page.
  const mine = data.recent.map((g) => {
    const side = g.red.id === u.id ? 'red' : 'blue';
    return { score: g.scores[side], won: g.winner === side, lost: g.winner !== null && g.winner !== side };
  });
  const best = mine.length ? Math.max(...mine.map((m) => m.score)) : null;
  const avg = mine.length ? Math.round(mine.reduce((n, m) => n + m.score, 0) / mine.length) : null;
  let streak = 0;
  const streakKind = mine[0]?.won ? 'won' : mine[0]?.lost ? 'lost' : null;
  for (const m of mine) {
    if ((streakKind === 'won' && m.won) || (streakKind === 'lost' && m.lost)) streak++;
    else break;
  }

  return (
    <div className="column pt-6">
      <section className="flex flex-wrap items-center gap-4 rounded-card bg-surface p-3.5 sm:p-5.5" aria-labelledby="player-name">
        <Avatar id={u.id} name={u.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 id="player-name" className="truncate text-title">
            {u.name}
          </h1>
          <p className="text-meta text-muted">
            Joined {new Date(u.createdAt).toISOString().slice(0, 10)} · seen {relativeTime(u.lastSeenAt)}
          </p>
        </div>
        {isMe && (
          <ButtonLink to="/settings" variant="secondary" icon="settings">
            Edit name
          </ButtonLink>
        )}
      </section>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
        <Panel title="Rating" className="lg:col-span-2" action={<span className="text-meta text-muted">After each rated game</span>}>
          <p className="num text-figure font-semibold">{u.rating}</p>
          <p className="num mb-3 text-meta text-muted">
            Peak {peak} · {data.history.length - 1} rated {data.history.length - 1 === 1 ? 'game' : 'games'}
          </p>
          <RatingChart points={data.history} />
        </Panel>
        <Panel title="Record">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Won', u.wins],
              ['Lost', u.losses],
              ['Drawn', u.draws],
            ].map(([label, n]) => (
              <div key={label} className="rounded-panel bg-raised py-3">
                <dt className="text-meta text-muted">{label}</dt>
                <dd className="num text-figure font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 text-body">
            <dt className="text-muted">Games</dt>
            <dd className="num text-right">{u.games}</dd>
            <dt className="text-muted">Win rate</dt>
            <dd className="num text-right">{winRate === null ? MISSING : `${winRate}%`}</dd>
            <dt className="text-muted">Decisive games</dt>
            <dd className="num text-right">{decided}</dd>
            <dt className="text-muted">Best final score</dt>
            <dd className="num text-right">{best === null ? MISSING : `₱${best}`}</dd>
            <dt className="text-muted">Average final score</dt>
            <dd className="num text-right">{avg === null ? MISSING : `₱${avg}`}</dd>
            <dt className="text-muted">Current run</dt>
            <dd className="num text-right">{streakKind && streak ? `${streakKind === 'won' ? 'Won' : 'Lost'} ${streak} in a row` : MISSING}</dd>
          </dl>
          {data.recent.length > 0 && <p className="mt-3 text-meta text-faint">Scores and runs are from the last {plural(data.recent.length, 'game')}.</p>}
        </Panel>
      </div>

      <Panel title="Recent games" className="mt-3.5">
        {data.recent.length ? (
          <ul>
            {data.recent.map((g) => (
              <GameRow key={g.id} game={g} meId={u.id} />
            ))}
          </ul>
        ) : (
          <EmptyState>{isMe ? 'Your finished games show up here.' : `${u.name} has not finished a game yet.`}</EmptyState>
        )}
      </Panel>
    </div>
  );
}
