// Guest names: an adjective and a creature or instrument from Scidama's world, plus a number.
import { randomInt } from 'node:crypto';

const FIRST = [
  'Brave', 'Bright', 'Calm', 'Clever', 'Bold', 'Keen', 'Lucky', 'Quiet', 'Swift', 'Steady',
  'Nimble', 'Jolly', 'Witty', 'Sharp', 'Sunny', 'Mighty', 'Gentle', 'Rapid', 'Lively', 'Patient',
];

const SECOND = [
  'Tarsier', 'Carabao', 'Tamaraw', 'Pawikan', 'Agila', 'Butanding', 'Maya', 'Kalaw',
  'Abacus', 'Ampere', 'Volt', 'Prism', 'Vector', 'Dynamo', 'Turbine', 'Circuit', 'Meter', 'Joule',
];

export function guestName(): string {
  const a = FIRST[randomInt(FIRST.length)];
  const b = SECOND[randomInt(SECOND.length)];
  return `${a} ${b} ${randomInt(10, 100)}`;
}
