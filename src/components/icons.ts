/**
 * Icon path data.
 *
 * A tiny hand-picked set drawn on a 24x24 grid, filled rather than stroked so
 * one `<path fill="currentColor">` renders every one of them. Kept here rather
 * than pulled
 * from an icon package: four paths do not justify a dependency, and inline
 * paths keep the content script free of external asset requests.
 */
export const ICONS = {
  chevronDown: 'M12 15.4 5.6 9 7 7.6l5 5 5-5L18.4 9 12 15.4Z',
  chevronRight: 'M9 18.4 7.6 17l5-5-5-5L9 5.6 15.4 12 9 18.4Z',
  search: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4L20 21.3l1.3-1.3-4.9-4.9A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z',
  star: 'M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8L12 3.6Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 3v5.2l4 2.4.9-1.5-3.4-2V8H11Z',
  alert: 'M12 3 1.6 21h20.8L12 3Zm0 4 6.9 12H5.1L12 7Zm-1 4v4h2v-4h-2Zm0 5v2h2v-2h-2Z',
  book: 'M4 4h6a3 3 0 0 1 2 .8A3 3 0 0 1 14 4h6v14h-6a2 2 0 0 0-2 1.6A2 2 0 0 0 10 18H4V4Zm2 2v10h4a4 4 0 0 1 1 .1V7.8A1.6 1.6 0 0 0 10 6H6Zm12 0h-4a1.6 1.6 0 0 0-1 1.8v8.3a4 4 0 0 1 1-.1h4V6Z',
  chart: 'M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z',
  megaphone: 'M18 4 8 8H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1l1.2 5h2.6L8.6 14 18 18V4Zm-2 3.1v7.8L9 12.2V9.8L16 7.1Z',
  check: 'M9.6 16.2 5.4 12 4 13.4l5.6 5.6L20.4 8.2 19 6.8 9.6 16.2Z',
  external: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h5v2H6v11h11v-4h2v6H4V5h1Z',
} as const;

export type IconName = keyof typeof ICONS;
