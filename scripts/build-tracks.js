// Builds the shipped track maps (tracks/maps/<trackId>-<trackLength>.json) from recordings. Each recording is
// played through a dashboard, whose own track learning saves the outline, with its official corner numbers, once
// a whole lap is known. Tracks that already have a shipped map are left as they are. A recording from the 2026
// format also gives the track's overtake detection point, which goes to <out>/boost.json.
// Usage: node scripts/build-tracks.js [recordings/a.f1rec ...]   (no files: every recording in recordings/)
const fs = require('fs');
const path = require('path');
const {createDashboard} = require('../server');
const {loadRecording, isRecordingName} = require('../replay');

const OUT = path.join(__dirname, '..', 'tracks', 'maps');
const quiet = {log() {}, warn() {}, error() {}};

// {track, file} when a map was written, {track, skipped} otherwise; plus boost (the detection point in metres) when known
function buildTrack(recording, {out = OUT, trackComplete} = {}) {
  const {packets} = loadRecording(recording);
  const dash = createDashboard({httpPort: 0, udpPort: 0, trackDir: out, bundledTrackDir: out, trackComplete, log: quiet});
  const had = new Set(fs.existsSync(out) ? fs.readdirSync(out) : []);
  let track = null,
    result = null,
    boost = null;
  for (let i = 0; i < packets.length; i++) {
    dash.handlePacket(packets[i].buf);
    if (i % 20) continue; // learning every 20 packets is plenty: cars barely move between them
    const s = dash.refreshState();
    if (s.session) track = s.session.track;
    if (s.trackMap && s.trackMap.available && !result) {
      const name = `${s.trackMap.trackId}-${s.trackMap.trackLength}.json`;
      result = had.has(name) ? {track, skipped: 'already has a map'} : {track, file: path.join(out, name)};
    }
    if (s.trackMap && s.trackMap.boost != null) boost = s.trackMap.boost;
    if (result && boost != null) break; // (the detection point is learned when the countdown starts, usually in the first lap)
  }
  const last = dash.refreshState().trackMap; // what the packets since the last look taught it
  if (last && last.boost != null) boost = last.boost;
  if (!result) result = {track, skipped: track ? 'no complete lap in this recording' : 'no session in this recording'};
  return boost == null ? result : {...result, boost};
}

function main(args, {dir = path.join(__dirname, '..', 'recordings'), out = OUT, log = console, trackComplete} = {}) {
  let files = args.filter(a => !a.startsWith('--'));
  if (!files.length) {
    try {
      files = fs.readdirSync(dir).filter(isRecordingName).sort().map(n => path.join(dir, n));
    } catch (err) {
      files = [];
    }
  }
  if (!files.length) log.log('No recordings to build track maps from');
  let failed = 0;
  for (const file of files) {
    try {
      const r = buildTrack(file, {out, trackComplete});
      const corners = r.file ? JSON.parse(fs.readFileSync(r.file, 'utf8')).corners.length : 0;
      const detection = r.boost != null ? `, overtake detection at ${r.boost} m` : '';
      log.log(r.file ? `${r.track}: ${path.basename(r.file)} (${corners} corners${detection})` : `${path.basename(file)}: ${r.track ? r.track + ' ' : ''}${r.skipped}${detection}`);
    } catch (err) {
      failed++;
      log.error(`Could not read ${file}: ${err.message}`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = {buildTrack, main};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
