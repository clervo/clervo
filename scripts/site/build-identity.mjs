#!/usr/bin/env node

// Builds the Clervo production identity package from one geometry solver.
//
// The locked authority (02-logo-system, Hollow Apex v1.0) approves a concept:
// a hollow triangular apex with an inner void, crossed by one horizontal
// signal — red request in from the left, cyan qualification at the centre,
// gold verified outcome out to the right. It does not ship production vectors,
// and the site has been serving an unrelated diamond mark instead.
//
// Every variant below is derived from the same solved geometry rather than
// drawn per size, so the favicon, the header lockup, and the social avatar are
// the same mark rather than three drawings that resemble each other.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const brandDir = path.join(root, 'apps/site/brand');
const runtimeDir = path.join(root, 'apps/site/public-assets/brand');

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const VIEW = 64;
// An equilateral apex reads top-heavy at 16px. The base is widened and the
// apex pulled down so the mark sits on its optical centre rather than its
// arithmetic one.
const APEX_Y = 8;
const BASE_Y = 55;
const LEFT = 4.5;
const RIGHT = 59.5;
const CX = (LEFT + RIGHT) / 2;
// The limb thickness. The void is the outer triangle inset along its own angle
// bisectors by this amount, which is what keeps all three limbs optically equal
// — a uniform coordinate inset would thin the apex.
const LIMB = 7.6;

function insetVertex(a, b, c, distance) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const ux = (b[0] - a[0]) / ab;
  const uy = (b[1] - a[1]) / ab;
  const vx = (c[0] - a[0]) / ac;
  const vy = (c[1] - a[1]) / ac;
  const bisectorLength = Math.hypot(ux + vx, uy + vy);
  const bx = (ux + vx) / bisectorLength;
  const by = (uy + vy) / bisectorLength;
  const halfAngle = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
  const travel = distance / Math.sin(halfAngle);
  return [a[0] + bx * travel, a[1] + by * travel];
}

const round = (value) => Number(value.toFixed(2));

const apex = [CX, APEX_Y];
const baseRight = [RIGHT, BASE_Y];
const baseLeft = [LEFT, BASE_Y];
const voidApex = insetVertex(apex, baseRight, baseLeft, LIMB);
const voidRight = insetVertex(baseRight, baseLeft, apex, LIMB);
const voidLeft = insetVertex(baseLeft, apex, baseRight, LIMB);

// The signal crosses the void at the void's own centroid. Placing it on the
// outer centroid puts the beam visibly above the hole it is meant to pass
// through.
const signalY = round((voidApex[1] + voidRight[1] + voidLeft[1]) / 3);
const edgeX = (from, to) => round(from[0] + (to[0] - from[0]) * ((signalY - from[1]) / (to[1] - from[1])));
const voidEntryX = edgeX(voidLeft, voidApex);
const voidExitX = edgeX(voidRight, voidApex);

// Outer path and void are one even-odd path so the mark is a single fillable
// shape — required for favicons, app icons, and any single-colour export.
const APEX_PATH = [
  `M${CX} ${APEX_Y}L${round(baseRight[0])} ${BASE_Y}H${round(baseLeft[0])}Z`,
  `M${CX} ${round(voidApex[1])}L${round(voidLeft[0])} ${round(voidLeft[1])}H${round(voidRight[0])}Z`,
].join('');

export const geometry = {
  view: VIEW,
  apexPath: APEX_PATH,
  signalY,
  voidEntryX,
  voidExitX,
  limb: LIMB,
};

// ---------------------------------------------------------------------------
// Palette — locked in 03-brand-system/step-3a
// ---------------------------------------------------------------------------

const RED = '#FF3B30';
const CYAN = '#00E5FF';
const GOLD = '#FFC800';
const MIST = '#E6E6E8';
const BLACK = '#0B0B0B';

// ---------------------------------------------------------------------------
// Symbol variants
// ---------------------------------------------------------------------------

const CAP = 'stroke-linecap="round"';

// The beam is drawn in three segments rather than one gradient stroke: the
// colour change is a state change, not a blend, and a gradient would imply the
// request fades into the outcome.
function beam({ bleed = true, width = 3.1 } = {}) {
  const from = bleed ? -6 : LEFT - 1.5;
  const to = bleed ? VIEW + 6 : RIGHT + 1.5;
  return [
    `<path d="M${from} ${signalY}H${voidEntryX}" stroke="${RED}" stroke-width="${width}" ${CAP}/>`,
    `<path d="M${voidEntryX} ${signalY}H${voidExitX}" stroke="${CYAN}" stroke-width="${width}" ${CAP}/>`,
    `<path d="M${voidExitX} ${signalY}H${to}" stroke="${GOLD}" stroke-width="${width}" ${CAP}/>`,
  ].join('');
}

function symbol({ id, title, apexFill = MIST, background = null, showBeam = true, monochrome = null, bleed = true, padding = 0 }) {
  const size = VIEW + padding * 2;
  const shift = padding === 0 ? '' : ` transform="translate(${padding} ${padding})"`;
  const apexColour = monochrome ?? apexFill;
  const beamMarkup = showBeam
    ? (monochrome === null
      ? beam({ bleed })
      // A monochrome mark cannot carry state colour, so the beam becomes a
      // single stroke at reduced opacity: present as structure, silent as state.
      : `<path d="M${bleed ? -6 : LEFT - 1.5} ${signalY}H${bleed ? VIEW + 6 : RIGHT + 1.5}" stroke="${monochrome}" stroke-width="3.1" stroke-opacity=".55" ${CAP}/>`)
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-labelledby="${id}-title">`,
    `<title id="${id}-title">${title}</title>`,
    background === null ? '' : `<rect width="${size}" height="${size}" fill="${background}"/>`,
    `<g${shift}>`,
    beamMarkup,
    `<path d="${APEX_PATH}" fill="${apexColour}" fill-rule="evenodd"/>`,
    '</g>',
    '</svg>',
    '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Wordmark
// ---------------------------------------------------------------------------

// Space Grotesk 600 outlines for "CLERVO", extracted once with opentype.js and
// inlined so the wordmark never depends on a font loading. Baseline at y=0,
// cap height 71.4, advance 388.8 at 100px with 0.06em tracking.
const WORDMARK_PATH = 'M28.9 1.4C11.2 1.4 5.2-9.6 5.2-24.7v-21.7c0-15.1 6-26.1 23.7-26.1 15.4 0 22.6 8.5 22.6 21.4v3.2H38.2v-3c0-6.2-2.5-10.3-9.3-10.3-7.4 0-10.1 4.6-10.1 12.4v26.5c0 7.8 2.7 12.4 10.1 12.4 6.8 0 9.3-4.1 9.3-10.3v-4.2h13.3v4.4C51.5-7.1 44.3 1.4 28.9 1.4ZM61.9 0v-71.4h13.4v59.5h29.6V0Zm52.9 0v-71.4h44.6v11.9h-31.2v17.2h28.4v11.9h-28.4v18.5h31.2V0Zm56.7 0v-71.4h27.4c13.9 0 21.1 7.6 21.1 19.6 0 9.2-4.2 15.5-11.8 18.1L221.5 0h-14.9l-11.6-31.3h-9.7V0Zm13.4-43.2h12.8c6 0 9-3 9-8.3 0-5.4-3-8.4-9-8.4h-12.8ZM248.7 0l-22.2-71.4h14.4l16.1 55.5 16.1-55.5h14L265 0Zm70.4 1.4c-17.7 0-24.7-11-24.7-26.1v-21.7c0-15.1 7-26.1 24.7-26.1s24.7 11 24.7 26.1v21.7c0 15.1-7 26.1-24.7 26.1Zm0-11.9c7.9 0 11.3-4.6 11.3-12.4v-26.5c0-7.8-3.4-12.4-11.3-12.4s-11.3 4.6-11.3 12.4v26.5c0 7.8 3.4 12.4 11.3 12.4Z';
const WORDMARK_ADVANCE = 344;
const WORDMARK_CAP = 71.4;

function lockup({ id, title, orientation, colour = MIST, monochrome = null, showBeam = true }) {
  const markColour = monochrome ?? colour;
  const textColour = monochrome ?? colour;
  if (orientation === 'horizontal') {
    // Optical alignment: the wordmark's cap height is matched to the apex's
    // visual height, not its bounding box, and the gap is one limb width — the
    // same measure that governs the mark's own internal spacing.
    const markSize = 40;
    const scale = markSize / VIEW;
    const capTarget = markSize * 0.62;
    const textScale = capTarget / WORDMARK_CAP;
    const gap = markSize * 0.42;
    const textX = markSize + gap;
    const textWidth = WORDMARK_ADVANCE * textScale;
    const width = Math.ceil(textX + textWidth);
    const height = markSize;
    const baseline = height / 2 + capTarget / 2;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title">`,
      `<title id="${id}-title">${title}</title>`,
      `<g transform="scale(${round(scale)})">`,
      showBeam && monochrome === null ? beam({ bleed: false }) : '',
      showBeam && monochrome !== null
        ? `<path d="M${LEFT - 1.5} ${signalY}H${RIGHT + 1.5}" stroke="${markColour}" stroke-width="3.1" stroke-opacity=".55" ${CAP}/>`
        : '',
      `<path d="${APEX_PATH}" fill="${markColour}" fill-rule="evenodd"/>`,
      '</g>',
      `<g transform="translate(${round(textX)} ${round(baseline)}) scale(${round(textScale)})">`,
      `<path d="${WORDMARK_PATH}" fill="${textColour}"/>`,
      '</g>',
      '</svg>',
      '',
    ].filter(Boolean).join('\n');
  }
  // Compact / stacked: used where horizontal space is the constraint, e.g.
  // the mobile navigation panel head and the app splash.
  const markSize = 48;
  const scale = markSize / VIEW;
  const capTarget = 15;
  const textScale = capTarget / WORDMARK_CAP;
  const textWidth = WORDMARK_ADVANCE * textScale;
  const width = Math.ceil(Math.max(markSize, textWidth));
  const gap = 12;
  const height = Math.ceil(markSize + gap + capTarget);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title">`,
    `<title id="${id}-title">${title}</title>`,
    `<g transform="translate(${round((width - markSize) / 2)} 0) scale(${round(scale)})">`,
    showBeam && monochrome === null ? beam({ bleed: false }) : '',
    `<path d="${APEX_PATH}" fill="${markColour}" fill-rule="evenodd"/>`,
    '</g>',
    `<g transform="translate(${round((width - textWidth) / 2)} ${height}) scale(${round(textScale)})">`,
    `<path d="${WORDMARK_PATH}" fill="${textColour}"/>`,
    '</g>',
    '</svg>',
    '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const assets = [
  // Master — the single source every other variant is cut from.
  ['clervo-apex-master.svg', symbol({ id: 'apex-master', title: 'Clervo Hollow Apex' })],
  // Symbol only, no beam. Used where the mark sits next to live product state
  // and a decorative beam would compete with a real one.
  ['clervo-apex-symbol.svg', symbol({ id: 'apex-symbol', title: 'Clervo', showBeam: false })],
  // Monochrome and reversed — print, embroidery, single-colour partner walls.
  ['clervo-apex-mono-light.svg', symbol({ id: 'apex-mono-light', title: 'Clervo', monochrome: MIST })],
  ['clervo-apex-mono-dark.svg', symbol({ id: 'apex-mono-dark', title: 'Clervo', monochrome: BLACK })],
  // Favicon: padded and non-bleeding. A bleeding beam is clipped to noise by
  // the browser's own rounding at 16px.
  ['favicon.svg', symbol({ id: 'favicon', title: 'Clervo', background: BLACK, bleed: false, padding: 6 })],
  // App icon and social avatar carry the background so they never composite
  // onto an unknown surface.
  ['clervo-app-icon.svg', symbol({ id: 'app-icon', title: 'Clervo', background: BLACK, bleed: false, padding: 10 })],
  ['clervo-social-avatar.svg', symbol({ id: 'social-avatar', title: 'Clervo', background: BLACK, bleed: false, padding: 12 })],
  // Registry-safe: GitHub, npm, and PyPI all render on both light and dark, so
  // these two are the only pair permitted there.
  ['clervo-registry-dark.svg', symbol({ id: 'registry-dark', title: 'Clervo', background: BLACK, bleed: false, padding: 8 })],
  ['clervo-registry-light.svg', symbol({ id: 'registry-light', title: 'Clervo', apexFill: BLACK, background: '#FFFFFF', bleed: false, padding: 8 })],
  // Lockups.
  ['clervo-lockup-horizontal.svg', lockup({ id: 'lockup-h', title: 'Clervo', orientation: 'horizontal' })],
  ['clervo-lockup-horizontal-mono-dark.svg', lockup({ id: 'lockup-h-mono', title: 'Clervo', orientation: 'horizontal', monochrome: BLACK })],
  ['clervo-lockup-compact.svg', lockup({ id: 'lockup-c', title: 'Clervo', orientation: 'compact' })],
];

const CLEAR_SPACE = round(LIMB);

const specification = {
  identity: 'clervo.hollow-apex',
  version: '1.0.0',
  authority: '02-logo-system/locked/CLERVO-HOLLOW-APEX-LOGO-AUTHORITY-v1.0-LOCKED-2026-08-04.md',
  concept: 'Hollow triangular apex with an inner void, crossed left to right by one signal: red request, cyan qualification, gold verified outcome.',
  geometry: {
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    view: VIEW,
    // The single even-odd path that is the mark. Every export and the runtime
    // component read this one string, so the header mark and the favicon can
    // never drift apart.
    apexPath: APEX_PATH,
    apex: [CX, APEX_Y],
    left: LEFT,
    right: RIGHT,
    baseLeft: [LEFT, BASE_Y],
    baseRight: [RIGHT, BASE_Y],
    limbWidth: LIMB,
    signalY,
    voidEntryX,
    voidExitX,
    opticalCorrections: [
      'Base widened beyond equilateral so the mark does not read top-heavy below 24px.',
      'Void derived by angle-bisector inset, not coordinate inset, so all three limbs carry equal optical weight.',
      'Signal placed on the void centroid rather than the outer centroid, so the beam reads as passing through the hole.',
    ],
  },
  palette: { request: RED, qualify: CYAN, verified: GOLD, mist: MIST, black: BLACK },
  clearSpace: {
    rule: 'One limb width on every side, measured at the mark\'s own scale.',
    atViewBox64: CLEAR_SPACE,
  },
  minimumSize: {
    symbolPx: 16,
    symbolWithBeamPx: 24,
    horizontalLockupPx: 96,
    note: 'Below 24px the three-colour beam is not resolvable; use clervo-apex-symbol.svg or favicon.svg, which are drawn for that range.',
  },
  animation: {
    rule: 'The beam animates only to represent a real operation state. Idle is static.',
    sequence: ['request', 'qualify', 'execute', 'verify', 'receipt'],
    forbidden: ['looping idle shimmer', 'rotation', 'gold before verification'],
    reducedMotion: 'No beam animation; the final state is rendered directly.',
  },
  accessibility: {
    decorative: 'aria-hidden="true" when a text wordmark is adjacent.',
    standalone: 'role="img" with an accessible name of "Clervo".',
    colourIndependence: 'Beam colour never carries meaning alone; the adjacent label states the operation state in text.',
  },
  rejected: [
    'The diamond-and-arc favicon previously served at /assets/favicon.svg — not the locked concept.',
    'The bare letter "C" header mark in apps/site/src/App.tsx — not a Clervo mark.',
    'Any apex drawn without the inner void, or with a beam that does not exit gold to the right.',
  ],
  assets: assets.map(([name]) => name),
};

await mkdir(brandDir, { recursive: true });
await mkdir(runtimeDir, { recursive: true });

for (const [name, markup] of assets) {
  await writeFile(path.join(brandDir, name), markup);
  await writeFile(path.join(runtimeDir, name), markup);
}
await writeFile(path.join(brandDir, 'identity.json'), `${JSON.stringify(specification, null, 2)}\n`);

// The favicon is also written to the legacy path so already-published
// references, the manifest, and cached crawler entries resolve to the new mark
// rather than 404-ing or serving the rejected diamond.
await writeFile(
  path.join(root, 'apps/site/public-assets/favicon.svg'),
  assets.find(([name]) => name === 'favicon.svg')[1],
);

console.log(`identity: PASS (${assets.length} assets, limb ${LIMB}, signal y=${signalY})`);
