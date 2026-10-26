// Track map: the learned outline, 2026 active aero and DRS zones, every rival and your car. It can be turned
// (rotation, in degrees clockwise); the map is fitted to the canvas again at every angle.
import {TRACK_BUCKET_M, zoneRanges} from '@shared';
import type {Corner, Motion, Rival, Session, TrackOutline, Zone} from '@shared';
import {DISPLAY_FONT} from './fonts';

export const AERO_ZONE_COLOR = 'rgba(51, 214, 232, .9)';
export const DRS_ZONE_COLOR = 'rgba(31, 209, 102, .9)';
/** The overtake (boost) detection point, 2026. */
export const BOOST_MARK_COLOR = '#ffb020';

export interface MapInput {
  track: TrackOutline;
  rivals: Rival[];
  car: Motion | null;
  session: Session | null | undefined;
  /** Official corner numbers, drawn beside the outline. */
  corners?: Corner[];
  /** Degrees clockwise the map is turned; 0 (the default) keeps the game's own orientation. */
  rotation?: number;
  /** The game's UDP format. 2026 has no DRS: only the active aero zones and the boost detection point are drawn. */
  format?: number | null;
  /** Lap distance (m) of the overtake detection point, once it is known. */
  boost?: number | null;
}

export function drawTrackMap(ctx: CanvasRenderingContext2D, w: number, h: number, {track, rivals: all, car, session, corners = [], rotation = 0, format, boost}: MapInput): void {
  const rivals = all.filter(r => !r.player && (r.x || r.z)) as (Rival & {x: number; z: number})[];
  const keys = [...track.keys()].sort((a, b) => a - b);
  const pts = [...keys.map(k => track.get(k)!), ...rivals, ...(car ? [car] : [])];
  if (pts.length < 2) {
    ctx.fillStyle = '#7a8195';
    ctx.textAlign = 'center';
    ctx.font = `600 12px ${DISPLAY_FONT}`;
    ctx.fillText('WAITING FOR CARS ON TRACK', w / 2, h / 2);
    return;
  }
  // positions as turned about the origin; everything below is placed with these
  const turn = (rotation * Math.PI) / 180,
    cos = Math.cos(turn),
    sin = Math.sin(turn);
  const rx = (p: {x: number; z: number}) => p.x * cos - p.z * sin,
    rz = (p: {x: number; z: number}) => p.x * sin + p.z * cos;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, rx(p));
    maxX = Math.max(maxX, rx(p));
    minZ = Math.min(minZ, rz(p));
    maxZ = Math.max(maxZ, rz(p));
  }
  const pad = 22,
    spanX = maxX - minX || 1,
    spanZ = maxZ - minZ || 1;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const ox = (w - spanX * scale) / 2,
    oy = (h - spanZ * scale) / 2;
  const px = (p: {x: number; z: number}) => ox + (rx(p) - minX) * scale,
    py = (p: {x: number; z: number}) => oy + (rz(p) - minZ) * scale;

  // outline: connect consecutive buckets, break the line across gaps not yet driven
  if (keys.length > 1) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    keys.forEach((k, i) => {
      const p = track.get(k)!;
      if (i && k - keys[i - 1] <= 4) ctx.lineTo(px(p), py(p));
      else ctx.moveTo(px(p), py(p));
    });
    const first = track.get(keys[0])!,
      last = track.get(keys[keys.length - 1])!;
    if (Math.hypot(first.x - last.x, first.z - last.z) < TRACK_BUCKET_M * 6) ctx.lineTo(px(first), py(first));
    ctx.strokeStyle = '#1c2030';
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = '#2b3042';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225, 6, 0, .75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 2026: active aero zones (cyan) and DRS zones (green) along the learned outline
  const drawZones = (ranges: Zone[], color: string) => {
    if (!ranges.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (const [from, to] of ranges) {
      ctx.beginPath();
      let prev: number | null = null;
      for (const k of keys) {
        const d = k * TRACK_BUCKET_M;
        if (d < from || d > to) {
          prev = null;
          continue;
        }
        const p = track.get(k)!;
        if (prev !== null && k - prev <= 4) ctx.lineTo(px(p), py(p));
        else ctx.moveTo(px(p), py(p));
        prev = k;
      }
      ctx.stroke();
    }
  };
  if (session && keys.length > 1) {
    drawZones(zoneRanges(session.aeroZones, session.trackLength), AERO_ZONE_COLOR);
    if ((format ?? 0) < 2026) drawZones(zoneRanges(session.drsZones, session.trackLength), DRS_ZONE_COLOR);
  }
  if (boost != null && (format ?? 0) >= 2026 && keys.length > 1) drawBoostDetection(ctx, track, boost, px, py);

  if (corners.length && keys.length > 1) drawMapCorners(ctx, track, keys, corners, px, py);

  ctx.font = `700 11px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  for (const r of rivals) {
    const x = px(r),
      y = py(r);
    ctx.globalAlpha = r.result > 3 ? 0.35 : r.pit ? 0.6 : 1;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = r.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#07080b';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7, 8, 11, .85)';
    const label = r.name.slice(0, 3).toUpperCase();
    ctx.strokeText(label, x, y - 10);
    ctx.fillStyle = '#eceef3';
    ctx.fillText(label, x, y - 10);
    ctx.globalAlpha = 1;
  }
  if (car) {
    ctx.beginPath();
    ctx.arc(px(car), py(car), 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e10600';
    ctx.stroke();
  }
}

/** The outline point nearest to bucket k (the outline can have gaps), or null. */
function outlineAt(track: TrackOutline, k: number) {
  for (let o = 0; o < 12; o++) {
    const p = track.get(k + o) || track.get(k - o);
    if (p) return p;
  }
  return null;
}

/** The overtake detection point: a bar across the track at that lap distance. */
function drawBoostDetection(
  ctx: CanvasRenderingContext2D,
  track: TrackOutline,
  boost: number,
  px: (p: {x: number; z: number}) => number,
  py: (p: {x: number; z: number}) => number
) {
  const k = Math.floor(boost / TRACK_BUCKET_M),
    p = outlineAt(track, k),
    a = outlineAt(track, k - 4),
    b = outlineAt(track, k + 4);
  if (!p || !a || !b) return;
  const tx = px(b) - px(a),
    ty = py(b) - py(a),
    len = Math.hypot(tx, ty) || 1,
    nx = (-ty / len) * 11,
    ny = (tx / len) * 11,
    x = px(p),
    y = py(p);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - nx, y - ny);
  ctx.lineTo(x + nx, y + ny);
  ctx.strokeStyle = 'rgba(7, 8, 11, .9)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = BOOST_MARK_COLOR;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Official corner numbers just beside the track: of the two sides, the one further from the rest of the outline. */
function drawMapCorners(
  ctx: CanvasRenderingContext2D,
  track: TrackOutline,
  keys: number[],
  corners: Corner[],
  px: (p: {x: number; z: number}) => number,
  py: (p: {x: number; z: number}) => number
) {
  const at = (k: number) => outlineAt(track, k);
  const outline = keys.filter((_, i) => i % 3 === 0).map(k => [px(track.get(k)!), py(track.get(k)!)]);
  const clearance = (x: number, y: number) => outline.reduce((m, [ox, oy]) => Math.min(m, Math.hypot(ox - x, oy - y)), Infinity);
  ctx.font = `700 11px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const placed: number[][] = [];
  const free = (x: number, y: number) => placed.every(q => Math.hypot(q[0] - x, q[1] - y) >= 19);
  for (const c of corners) {
    const k = Math.floor(c.d / TRACK_BUCKET_M),
      p = at(k),
      a = at(k - 4),
      b = at(k + 4);
    if (!p || !a || !b) continue;
    const tx = px(b) - px(a),
      ty = py(b) - py(a),
      len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len,
      ny = tx / len,
      x0 = px(p),
      y0 = py(p),
      gap = 15;
    const side = clearance(x0 + nx * gap, y0 + ny * gap) >= clearance(x0 - nx * gap, y0 - ny * gap) ? 1 : -1;
    // corners close together (chicanes): move a label further out, or across, rather than on top of another
    const spots = [[side, gap], [side, gap * 2], [-side, gap], [-side, gap * 2]].map(([s, g]) => [x0 + nx * g * s, y0 + ny * g * s]);
    const [x, y] = spots.find(([sx, sy]) => free(sx, sy)) || spots[0];
    placed.push([x, y]);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 17, 24, .9)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#454b5e';
    ctx.stroke();
    ctx.fillStyle = '#aeb3c2';
    ctx.fillText(c.n, x, y + 0.5);
  }
  ctx.textBaseline = 'alphabetic';
}
