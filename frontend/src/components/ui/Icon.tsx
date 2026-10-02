/* Ichki SVG ikonlar: tashqi kutubxona va internet talab qilinmaydi. */
const P: Record<string, string> = {
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1',
  search: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5m5 5H9a5 5 0 0 0 0 10h3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  cursor: 'm4 4 7 16 2.5-6.5L20 11 4 4Z',
  boxSel: 'M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8',
  ruler: 'M3 17 17 3l4 4L7 21l-4-4Zm4-4 2 2m2-6 2 2m2-6 2 2',
  focus: 'M3 8V5a2 2 0 0 1 2-2h3m8 0h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3m-8 0H5a2 2 0 0 1-2-2v-3m9-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  isolate: 'M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5',
  xray: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18M3 12h18',
  edges: 'M4 7l8-4 8 4v10l-8 4-8-4V7Z',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  axes: 'M4 20V4m0 16h16M4 20l7-7',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5',
  merge: 'M7 4v4a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v4M7 20v-4M17 4v4',
  split: 'M12 4v6m0 0-6 6v4m6-10 6 6v4',
  glue: 'M10 4h4v6h-4zM6 10h12v4H6zM8 14v6m8-6v6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7M4 4l3 3m10 10 3 3',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  rotateL: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  move: 'M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3',
  save: 'M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v6h8V3M7 21v-7h10v7',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0m1-10a3 3 0 1 0 0-6m2 16a6 6 0 0 0-3-5.2',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4m-4 4h11',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  warn: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 16v-5m0-3h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  chevronL: 'm15 18-6-6 6-6',
  chevronR: 'm9 18 6-6-6-6',
  chevronD: 'm6 9 6 6 6-6',
  arrowR: 'M5 12h14m-6-6 6 6-6 6',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  drawing: 'M4 20h16M6 16V6h8l4 4v6H6Zm8-10v4h4',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  sliders: 'M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M14 4v4M8 10v4M16 16v4',
  lid: 'M3 9h18l-2-5H5L3 9Zm1 0v10h16V9',
  explode: 'M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8',
  top: 'M4 4h16v16H4zM4 4l16 16',
  tag: 'M20 12 12 20 4 12V4h8l8 8ZM8 8h.01',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  sheet: 'M4 4h16v16H4zM4 9h16M4 14h16M10 4v16',
  play: 'M7 4v16l13-8L7 4Z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 3',
  material: 'M4 6h16v4H4zM4 14h16v4H4z',
  hand: 'M8 11V5a1.5 1.5 0 0 1 3 0v5m0-1V4a1.5 1.5 0 0 1 3 0v6m0-1V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3.5 15a1.5 1.5 0 0 1 2.5-1.7L8 16',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z',
  flip: 'M12 3v18M8 7 4 12l4 5M16 7l4 5-4 5',
  face: 'M4 8 12 4l8 4-8 4-8-4Z',
  edge: 'M5 19 19 5',
  vertex: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M4 20l5-5M15 9l5-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  panelL: 'M4 4h16v16H4zM9 4v16',
  panelR: 'M4 4h16v16H4zM15 4v16',
};

export function Icon({ name, size = 18, stroke = 1.8, className, title }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string; title?: string }) {
  const d = P[name] || P.info;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round">
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5" />
      </svg>
    </span>
  );
}
