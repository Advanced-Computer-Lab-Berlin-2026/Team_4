const strokes = {
  shed: 'M3 10 12 3l9 7v10H3zM8 20v-7h8v7M8 16h8',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  upRight: 'M6 18 18 6M7 6h11v11',
  chevron: 'm6 9 6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M18 6 6 18',
  search: 'M15.5 15.5 21 21M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 3Z',
  heart: 'M20.7 5.6a5.2 5.2 0 0 0-7.4 0L12 6.9l-1.3-1.3a5.2 5.2 0 1 0-7.4 7.4l1.3 1.3L12 22l7.4-7.7 1.3-1.3a5.2 5.2 0 0 0 0-7.4Z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5m-2 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  moon: 'M20.6 15.2A9 9 0 0 1 8.8 3.4 9 9 0 1 0 20.6 15.2Z',
  monitor: 'M3 4h18v13H3zM8 21h8m-4-4v4',
  warning: 'M11.1 4.5a1 1 0 0 1 1.8 0l8 14A1 1 0 0 1 20 20H4a1 1 0 0 1-.9-1.5zM12 9v4m0 3v.1',
  info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zm-10-1v6m0-10v.1',
  check: 'm5 12 4 4L19 6',
  user: 'M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  tool: 'M14 6a6 6 0 0 0-7.8 7.6L2.8 17a2.5 2.5 0 1 0 3.5 3.5l3.4-3.4A6 6 0 0 0 17.5 9l-3.3 3.3-3-3L14 6Z',
  power: 'm13 2-9 12h7l-1 8 10-12h-7l1-8Z',
  ladder: 'M7 3v18M17 3v18M7 6h10M7 12h10M7 18h10',
  garden: 'M12 21v-8M12 14C5 14 3 10 3 5c5 0 9 2 9 9Zm0 3c6 0 9-4 9-9-6 0-9 3-9 9Z',
  tent: 'M2 20 12 3l10 17H2Zm6 0 4-7 4 7m-4-7V3',
  clean: 'M12 2v7m-3.5-3.5h7M5 11v5m-2.5-2.5h5M18 11v10m-5-5h10',
  box: 'M3 8h18v13H3zM2 3h20v5H2zM9 12h6',
  calendar: 'M3 5h18v16H3zM7 3v4m10-4v4M3 10h18',
  bag: 'M5 7h14l2 14H3L5 7Zm4 2V6a3 3 0 0 1 6 0v3',
  chart: 'M3 3v18h18M8 16v-4m5 4V8m5 8V5',
};

export default function Icon({ name, size = 20, filled = false }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size}
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.65"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={strokes[name]} />
    </svg>
  );
}
