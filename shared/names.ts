// File names: recordings (what was recorded and when, e.g. 2026-10-26_22-36-31_Silverstone_Time-Trial_F1-26) and track
// maps (the track, then its game id and lap length, e.g. Silverstone_7-5890.json).
import {sessionName} from './regulations';

/** Letters and digits of a name, words joined by dashes ('Portimão' -> 'Portimao', 'Abu Dhabi' -> 'Abu-Dhabi'). */
export const fileSlug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The name (without extension) of a recording started at `at` (local time): date, time, then whatever is known of the
 * session: track, session type and game format. Before the game has sent the session, it is the date and time alone.
 */
export function recordingName(
  at: Date,
  session?: {track?: string | null; sessionType?: number | null; packetFormat?: number | null} | null
): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}_${p(at.getHours())}-${p(at.getMinutes())}-${p(at.getSeconds())}`;
  const format = session?.packetFormat ? `F1-${String(session.packetFormat).slice(2)}` : '';
  return [stamp, fileSlug(session?.track || ''), fileSlug(sessionName(session?.sessionType)), format].filter(Boolean).join('_');
}

/** What a track map is looked up by: the game's track id and the lap length in metres ('7-5890'). */
export const trackMapKey = (trackId: number, trackLength: number): string => `${trackId}-${trackLength}`;

/** The file a track's map is saved as: 'Silverstone_7-5890.json', 'Abu-Dhabi_14-5280.json'. */
export const trackMapFileName = (track: string | null | undefined, trackId: number, trackLength: number): string =>
  [fileSlug(track || ''), trackMapKey(trackId, trackLength)].filter(Boolean).join('_') + '.json';

/** The key a map file holds: from 'Silverstone_7-5890.json' (or the older '7-5890.json'), or null for any other file. */
export const mapFileKey = (fileName: string): string | null => /(?:^|_)(\d+-\d+)\.json$/.exec(fileName)?.[1] ?? null;
