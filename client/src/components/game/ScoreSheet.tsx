// The paper score sheet, for grades that keep more than one column. Grade 10's score is a product, so it reads 0
// until a side has both grams and °C, and these columns are what show the game moving.
import { GRADES, type Columns, type Grade, type Side } from '../../../../shared/engine.ts';
import { quantity } from '../../../../shared/notation.ts';
import { SideDot } from '../ui/controls.tsx';

export function ScoreSheet({ grade, columns }: { grade: Grade; columns: Record<Side, Columns> }) {
  const heads = GRADES[grade].columns;
  if (heads.length < 2) return null;
  return (
    <table className="num mx-5.5 mb-1 self-start border-collapse text-body" aria-label="Score sheet">
      <tbody>
        {(['red', 'blue'] as const).map((side) => (
          <tr key={side}>
            <th scope="row" className="py-0.5 pr-3 font-normal">
              <SideDot side={side} />
              <span className="sr-only">{side}</span>
            </th>
            {heads.map((column) => (
              <td key={column} className="py-0.5 pr-4 text-muted">
                {quantity(column, columns[side][column] ?? 0)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
