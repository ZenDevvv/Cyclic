// Elo ratings. New players start at 1200 and move faster for their first 30 rated games.

export const START_RATING = 1200;

export const kFactor = (games: number): number => (games < 30 ? 32 : 20);

export const expectedScore = (rating: number, opponent: number): number =>
  1 / (1 + Math.pow(10, (opponent - rating) / 400));

export interface Rated {
  rating: number;
  games: number;
}

/** New ratings after a game. `scoreA` is 1 for a win by A, 0.5 for a draw, 0 for a loss. */
export function rate(a: Rated, b: Rated, scoreA: 0 | 0.5 | 1): { a: number; b: number } {
  const ea = expectedScore(a.rating, b.rating);
  const eb = 1 - ea;
  const scoreB = 1 - scoreA;
  return {
    a: Math.round(a.rating + kFactor(a.games) * (scoreA - ea)),
    b: Math.round(b.rating + kFactor(b.games) * (scoreB - eb)),
  };
}
