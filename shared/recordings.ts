// Recording file names: what was recorded and when, e.g. 2026-10-26_22-36-31_Silverstone_Time-Trial_F1-26
import {sessionName} from './regulations';

/** Letters and digits of a name, words joined by dashes ('Portimão' -> 'Portimao', 'Abu Dhabi' -> 'Abu-Dhabi'). */
const slug = (s: string): string =>
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
  return [stamp, slug(session?.track || ''), slug(sessionName(session?.sessionType)), format].filter(Boolean).join('_');
}
