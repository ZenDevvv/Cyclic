// Words for the grade picker. The rules themselves are in shared/engine.ts.
import { GRADE_IDS, type Grade } from '../../../shared/engine.ts';

export const GRADE_OPTIONS = GRADE_IDS.map((value) => ({ value, label: `Grade ${value}` }));

export const GRADE_SUMMARY: Record<Grade, string> = {
  7: 'Electro: pesos and kilowatt-hours. Only like units score.',
  8: 'Scientific notation: all four signs score, and the numbers get very large.',
  9: 'Temperature humidity index: humidity turns into °F through a table.',
  10: 'Thermo: grams and °C multiply into a final score in calories.',
};
