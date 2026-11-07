// Says when a capture cannot be avoided. The amber ring can be turned off in Settings; this message cannot.
import { MathText } from '../ui/MathText.tsx';

export function CaptureNotice({ text }: { text: string }) {
  return (
    <p className="rounded-panel bg-raised px-4 py-2.5 text-body">
      <MathText>{text}</MathText>
    </p>
  );
}

/** Stays mounted so screen readers announce each change; a region added with its text is often missed. */
export function CaptureAnnouncer({ text }: { text: string | null }) {
  return (
    <p className="sr-only" role="status">
      {text}
    </p>
  );
}
