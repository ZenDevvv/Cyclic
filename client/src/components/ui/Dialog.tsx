// Native <dialog>: focus trap, Esc and inert background come from the browser.
import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional line under the title. */
  description?: ReactNode;
  width?: number;
  /** Hide the close button (the dialog still closes with Esc unless `locked`). */
  locked?: boolean;
}

export function Dialog({ open, onClose, title, description, children, width = 440, locked }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Start focus on the panel, not the close button, so no stray focus ring shows.
      d.querySelector<HTMLElement>('[data-dialog-panel]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !locked) onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto w-[calc(100vw-32px)] max-h-[calc(100dvh-32px)] overflow-visible rounded-card bg-transparent p-0 text-ink backdrop:bg-black/70"
      style={{ maxWidth: width }}
    >
      {open && (
        <div data-dialog-panel tabIndex={-1} className="animate-sheet max-h-[calc(100dvh-32px)] overflow-y-auto rounded-card bg-surface p-5.5 outline-none">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="text-title">
                {title}
              </h2>
              {description && <p className="mt-1 text-body text-muted">{description}</p>}
            </div>
            {!locked && <IconButton icon="close" label="Close" onClick={onClose} className="-mr-2 -mt-1.5" />}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
