// Words for the grade picker. The rules themselves are in shared/engine.ts.
import { GRADE_IDS, type Grade } from '../../../shared/engine.ts';
import type { BoardColours, BoardTheme } from '../store/prefs.ts';

export const GRADE_OPTIONS = GRADE_IDS.map((value) => ({ value, label: `Grade ${value}` }));

/** Each grade's board: the green table, a chalkboard, the sky, and the heat of clay. */
export const GRADE_COLOURS: Record<Grade, BoardColours> = { 7: 'felt', 8: 'chalk', 9: 'sky', 10: 'clay' };

export const boardColours = (theme: BoardTheme, grade: Grade): BoardColours => (theme === 'grade' ? GRADE_COLOURS[grade] : theme);

export const GRADE_SUMMARY: Record<Grade, string> = {
  7: 'Electro: pesos and kilowatt-hours. Only like units score.',
  8: 'Scientific notation: all four signs score, and the numbers get very large.',
  9: 'Temperature humidity index: humidity turns into °F through a table.',
  10: 'Thermo: grams and °C multiply into a final score in calories.',
};
