// One outline icon set, 1.5px stroke, drawn on a 20px grid.
import type { SVGProps } from 'react';

const PATHS = {
  copy: 'M7 7V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H13M4.5 7h7A1.5 1.5 0 0 1 13 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7Z',
  link: 'M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1',
  flip: 'M6 3v14M6 17l-3-3M6 17l3-3M14 17V3M14 3l-3 3M14 3l3 3',
  flag: 'M4.5 17.5V3.5M4.5 4h10l-2 3.5 2 3.5h-10',
  handshake: 'M2.5 9.5 5 7l3 1 2.5-1.5L14 9l3.5-2M5 12.5l2.5 2.5a1.4 1.4 0 0 0 2-2M8.5 13l2 2a1.4 1.4 0 0 0 2-2l-2-2M11.5 12l1.5 1.5a1.4 1.4 0 0 0 2-2L12 8.5',
  chat: 'M4 4.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  close: 'M5 5l10 10M15 5 5 15',
  menu: 'M3.5 6h13M3.5 10h13M3.5 14h13',
  chevronLeft: 'M12.5 4.5 7 10l5.5 5.5',
  chevronRight: 'M7.5 4.5 13 10l-5.5 5.5',
  first: 'M14.5 4.5 9 10l5.5 5.5M5.5 4.5v11',
  last: 'M5.5 4.5 11 10l-5.5 5.5M14.5 4.5v11',
  play: 'M6.5 4.5v11l9-5.5-9-5.5Z',
  pause: 'M7 4.5v11M13 4.5v11',
  settings: 'M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7',
  volume: 'M3.5 8v4h3l4 3.5v-11L6.5 8h-3ZM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10',
  mute: 'M3.5 8v4h3l4 3.5v-11L6.5 8h-3ZM13.5 8l4 4M17.5 8l-4 4',
  eye: 'M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10ZM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  clock: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 6v4l2.5 2',
  user: 'M10 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 17.5c.8-3 3.4-5 6.5-5s5.7 2 6.5 5',
  refresh: 'M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3',
  check: 'M4 10.5 8 14.5l8-9',
  logout: 'M8 3.5H4.5v13H8M13 6.5 16.5 10 13 13.5M16.5 10H8',
  arrowRight: 'M4 10h12M11 5l5 5-5 5',
  bot: 'M5 7.5h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 15 16.5H5A1.5 1.5 0 0 1 3.5 15V9A1.5 1.5 0 0 1 5 7.5ZM10 7.5v-3M7.5 11.5v1M12.5 11.5v1',
  users: 'M7.5 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 16.5c.7-2.6 2.9-4 5.5-4s4.8 1.4 5.5 4M13 3.7a3 3 0 0 1 0 5.6M14.5 12.7c1.6.5 2.8 1.8 3.3 3.8',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
