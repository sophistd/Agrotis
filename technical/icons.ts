const paths: Record<string, string> = {
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',
  'sound-off': '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
  earth: '<circle cx="12" cy="12" r="9"/><path d="m5 5.8 3 1 1 2.5-2 2.2-3.8-.3M13 3.1l-1 3.4 2 2.5 3-.6 2.6 2.6M12 12l3 1 1.5 3-2 4-2.5-2v-3l-2-1.5z"/>',
  moon: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="8" r="2"/><circle cx="15.5" cy="14.5" r="3"/><path d="M6.5 15.5h.01M15.5 7h.01"/>',
  asteroid: '<path d="m7 3 8-1 5 6 1 7-5 6-8 1-5-5-1-8zM7 3l2 6-7 0M9 9l7 3 4-4M16 12l-1 9M9 9l-1 13"/><circle cx="8" cy="15" r="1.3"/><path d="M14 6h.01"/>',
  meteor: '<path d="m11 14 9-11M14 17l7-7M7 10l8-8"/><path d="M11 14a4.5 4.5 0 1 1-5-4l4-2-1 4z"/>',
  comet: '<path d="M8 14 20 3M10 17l11-5M6 12l5-9"/><path d="M8 14c-2-2-5-1-5 2s3 6 5 4 3-4 0-6z"/>',
  station: '<path d="M8 9h8v6H8zM2 5h4v14H2zM18 5h4v14h-4zM6 12h2M16 12h2M12 4v5M10 4h4M12 15v5M10 20h4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  'solar-array': '<path d="M3 5h7v14H3zM14 5h7v14h-7zM10 12h4M6.5 5v14M17.5 5v14M3 9h7M3 15h7M14 9h7M14 15h7"/>',
  truss: '<path d="M2 8h20v8H2zM2 8l5 8 5-8 5 8 5-8M2 12h20"/>',
  cabin: '<path d="M5 7h14v10H5zM5 7 2 10v4l3 3M19 7l3 3v4l-3 3M8 7v10M16 7v10"/><circle cx="12" cy="12" r="1.7"/>',
  optics: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M8 13l4 4 4-4M12 9v8"/>',
  telescope: '<path d="m6 8 4-4 10 10-4 4zM6 8l-2 3 9 9 3-2M12 6l5-3 4 4-3 5M7 15l-4 3 3 3 4-3M9 5l-2-2M18 13l3 3"/>',
  'weather-satellite': '<path d="M12 9V3M9 3h6M7 8H3v6h4M17 8h4v6h-4M7 11h3M14 11h3"/><circle cx="12" cy="11" r="2"/><path d="M7 21h10a3 3 0 0 0 .3-6 4 4 0 0 0-7.5-.5A3.5 3.5 0 0 0 7 21z"/>',
  detector: '<rect x="5" y="5" width="14" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 2v3M16 2v3M8 19v3M16 19v3M2 8h3M2 16h3M19 8h3M19 16h3"/>',
  orbit: '<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/><circle cx="20" cy="6" r="1.7" fill="currentColor" stroke="none"/>',
  objects: '<circle cx="6" cy="6" r="3"/><path d="m15 3 5 1 1 5-5 1-2-4zM3 15h6v6H3M15 19l6-6M15 15l3-3"/><circle cx="15" cy="19" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
  satellite: '<path d="m9 7 8 8-4 4-8-8zM10 8l4-4 6 6-4 4M6 12l-4 4 6 6 4-4M13 7l4 4M5 15l4 4M17 2a5 5 0 0 1 5 5"/>',
  spark: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
  lab: '<path d="M9 3h6M10 3v7L4 20q-1 2 2 2h12q3 0 2-2l-6-10V3M7 16h10"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  focus: '<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L3.5 9.7l6.3-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
};
export function icon(name: string, size = 20) {
  const key = Object.hasOwn(paths, name) ? name : 'spark';
  return `<svg data-icon="${key}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
}
export function domainIcon(domain: string, size = 20, representation: 'model' | 'observation' = 'observation') {
  const names: Record<string, string> = {earth:'earth', moon:'moon', meteors:representation === 'model' ? 'asteroid' : 'meteor', comets:'comet', all:'objects'};
  return icon(names[domain] ?? 'objects', size);
}
export function satelliteIcon(groups: readonly string[], size = 20) {
  return icon(groups.includes('stations') ? 'station' : groups.includes('science') ? 'telescope' : groups.includes('weather') ? 'weather-satellite' : 'satellite', size);
}
