import { useEffect } from 'react';

/** Set the tab title for a page. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Scidama` : 'Scidama';
  }, [title]);
}
