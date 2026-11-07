import type { Grade } from '../../../shared/engine.ts';
import { GRADE_OPTIONS, GRADE_SUMMARY } from '../lib/grades.ts';
import { Segmented } from './ui/controls.tsx';

export function GradePicker({ value, onChange, disabled }: { value: Grade; onChange: (grade: Grade) => void; disabled?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-body font-medium">Grade</p>
      <Segmented<Grade> label="Grade" value={value} disabled={disabled} onChange={onChange} options={GRADE_OPTIONS} />
      <p className="mt-2 text-meta text-muted">{GRADE_SUMMARY[value]}</p>
    </div>
  );
}
