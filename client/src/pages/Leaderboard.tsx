import { Link } from 'react-router';
import type { LeaderboardRow } from '../../../shared/protocol.ts';
import { Avatar } from '../components/ui/Avatar.tsx';
import { Button } from '../components/ui/Button.tsx';
import { EmptyState, Skeleton } from '../components/ui/controls.tsx';
import { useApi } from '../lib/useApi.ts';
import { MISSING } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { useSession } from '../store/session.ts';

export default function Leaderboard() {
  useTitle('Leaderboard');
  const me = useSession((s) => s.me);
  const { data, error, loading, reload } = useApi<LeaderboardRow[]>('/leaderboard?limit=100');
  const th = 'h-9 px-2 text-meta font-normal text-muted';
  return (
    <div className="column pt-6">
      <div className="mb-5">
        <h1 className="text-title">Leaderboard</h1>
        <p className="mt-1 text-body text-muted">Players with at least one rated game, by Elo rating. Quick matches are rated.</p>
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-card bg-surface p-3.5 sm:p-5.5" aria-label="Ranking">
        {loading && !data ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-panel" />
            ))}
          </div>
        ) : error ? (
          <EmptyState action={<Button variant="ghost" onClick={reload}>Retry</Button>}>Couldn't load the leaderboard. {error}</EmptyState>
        ) : !data?.length ? (
          <EmptyState>Nobody has played a rated game yet.</EmptyState>
        ) : (
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-line text-left">
                <th className={`${th} w-10 text-right`}>Rank</th>
                <th className={th}>Player</th>
                <th className={`${th} text-right`}>Rating</th>
                <th className={`${th} text-right max-sm:hidden`}>Games</th>
                <th className={`${th} text-right max-sm:hidden`}>Won</th>
                <th className={`${th} text-right max-sm:hidden`}>Lost</th>
                <th className={`${th} text-right max-sm:hidden`}>Drawn</th>
                <th className={`${th} text-right`}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const mine = r.user.id === me?.id;
                return (
                  <tr key={r.user.id} className={`border-b border-rule last:border-b-0 ${mine ? 'bg-raised' : ''}`}>
                    <td className="num h-12 px-2 text-right text-faint">{r.rank}</td>
                    <td className="px-2">
                      <Link to={`/player/${r.user.id}`} className="flex min-w-0 items-center gap-2.5 font-medium hover:underline">
                        <Avatar id={r.user.id} name={r.user.name} size={28} />
                        <span className="truncate">{r.user.name}</span>
                        {mine && <span className="text-meta font-normal text-muted">you</span>}
                      </Link>
                    </td>
                    <td className="num px-2 text-right font-semibold">{r.user.rating}</td>
                    <td className="num px-2 text-right text-muted max-sm:hidden">{r.games}</td>
                    <td className="num px-2 text-right text-muted max-sm:hidden">{r.wins}</td>
                    <td className="num px-2 text-right text-muted max-sm:hidden">{r.losses}</td>
                    <td className="num px-2 text-right text-muted max-sm:hidden">{r.draws}</td>
                    <td className="num px-2 text-right text-muted">{r.games ? `${Math.round((r.wins / r.games) * 100)}%` : MISSING}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <aside className="rounded-card bg-surface p-5.5" aria-labelledby="how-ratings">
        <h2 id="how-ratings" className="text-card font-semibold">
          How ratings work
        </h2>
        {me && (
          <div className="mt-3 rounded-panel bg-raised p-3.5">
            <p className="text-meta text-muted">Where you stand</p>
            <p className="num mt-0.5 text-figure font-semibold">{me.rating}</p>
            <p className="text-body text-muted">
              {(() => {
                const row = data?.find((r) => r.user.id === me.id);
                return row ? `Rank ${row.rank} of ${data!.length}.` : 'Play a quick match to get on the board.';
              })()}
            </p>
          </div>
        )}
        <dl className="mt-4 flex flex-col gap-3 text-body">
          <div>
            <dt className="font-medium">Everyone starts at 1200</dt>
            <dd className="text-muted">Guests too. Set a password in Settings to keep your rating on other devices.</dd>
          </div>
          <div>
            <dt className="font-medium">Beat stronger players, gain more</dt>
            <dd className="text-muted">Elo: a win against an equal player is worth 16 points while you are new, 10 after 30 rated games.</dd>
          </div>
          <div>
            <dt className="font-medium">What counts</dt>
            <dd className="text-muted">Quick matches, and rooms where the host switched on Rated. Games that end before both sides have moved do not count.</dd>
          </div>
        </dl>
      </aside>
      </div>
    </div>
  );
}
