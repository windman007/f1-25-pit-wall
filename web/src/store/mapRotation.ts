// How far the track map has been spun, per track, in degrees (-180..180]. Remembered in localStorage.
import {create} from 'zustand';
import {KEYS, readJson, write} from '../storage';

/** Track id -> degrees; a track that isn't turned has no entry. */
type Angles = Record<string, number>;

/** One step of the rotate buttons. */
export const SPIN_STEP = 15;

function initial(): {angles: Angles} {
  const saved = readJson<unknown>(KEYS.mapRotation);
  const angles: Angles = {};
  if (saved && typeof saved === 'object')
    for (const [id, deg] of Object.entries(saved)) if (typeof deg === 'number' && Number.isFinite(deg) && normalize(deg)) angles[id] = normalize(deg);
  return {angles};
}

/** Whole degrees in (-180, 180]. */
const normalize = (deg: number) => {
  const d = Math.round((((deg % 360) + 540) % 360) - 180);
  return d === -180 ? 180 : d;
};

export const useMapRotation = create(initial);
export const resetMapRotation = () => useMapRotation.setState(initial(), true);

export const rotationOf = (trackId: number | null | undefined): number => (trackId == null ? 0 : useMapRotation.getState().angles[trackId] ?? 0);

/** Turns the map of one track to `deg`; `persist` stores it (false while a drag is still going). */
export function setRotation(trackId: number, deg: number, persist = true) {
  const angles = {...useMapRotation.getState().angles};
  const d = normalize(deg);
  if (d) angles[trackId] = d;
  else delete angles[trackId];
  useMapRotation.setState({angles});
  if (persist) write(KEYS.mapRotation, Object.keys(angles).length ? angles : null);
}

export const spinMap = (trackId: number, by: number) => setRotation(trackId, rotationOf(trackId) + by);
