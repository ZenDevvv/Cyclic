import { Skeleton } from './ui/controls.tsx';

export function PageSkeleton() {
  return (
    <div className="column pt-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-6 grid gap-3.5 md:grid-cols-3">
        <Skeleton className="h-40 rounded-card md:col-span-2" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    </div>
  );
}
