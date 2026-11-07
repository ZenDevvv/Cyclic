// Numbers from shared/notation.ts write exponents as Unicode superscripts, so they read in plain text. Inter's web
// font only has ¹ ² ³, and the rest would drop to a fallback font, so exponents are drawn as real superscripts here.
import { Fragment } from 'react';

const SUPERSCRIPT = /[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
const PLAIN: Record<string, string> = { '⁻': '−', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

export const plainExponent = (run: string): string => [...run].map((c) => PLAIN[c]).join('');

/** Keeps "4.4 × 10²" together when a line wraps. */
const unbroken = (text: string): string => text.replaceAll(' × 10', ' × 10');

export function MathText({ children }: { children: string }) {
  const text = unbroken(children);
  const parts: (string | { sup: string })[] = [];
  let at = 0;
  for (const match of text.matchAll(SUPERSCRIPT)) {
    parts.push(text.slice(at, match.index));
    parts.push({ sup: plainExponent(match[0]) });
    at = match.index + match[0].length;
  }
  parts.push(text.slice(at));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{typeof part === 'string' ? part : <sup>{part.sup}</sup>}</Fragment>
      ))}
    </>
  );
}
