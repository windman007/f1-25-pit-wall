// Renames recordings made with the old names (session-<UTC time>.f1rec) after what they hold, like new recordings are
// named: when they started (local time), the track, the session type and the game format, e.g.
// 2026-10-26_22-36-31_Silverstone_Time-Trial_F1-26.f1rec. A recording with no session in it is left as it is.
// Usage: node scripts/rename-recordings.js [recordings/a.f1rec ...] [--dry-run]
//   no files: every recording in recordings/ that still has an old name; --dry-run: only say what would be renamed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createDashboard} = require('../server');
const {loadRecording, isRecordingName} = require('../replay');
const {recordingName} = require('../build/shared');

const quiet = {log() {}, warn() {}, error() {}};

// {file, name} with the new name, or {file, skipped}
function newName(file, trackDir) {
  const {header, packets} = loadRecording(file);
  const dash = createDashboard({httpPort: 0, udpPort: 0, trackDir, log: quiet});
  for (const p of packets) {
    dash.handlePacket(p.buf);
    if (dash.state.session) break; // the first session packet says all we need
  }
  const session = dash.state.session;
  if (!session) return {file, skipped: 'no session in this recording'};
  const started = new Date(header.startedAt);
  const at = Number.isNaN(started.getTime()) ? fs.statSync(file).mtime : started;
  return {file, name: recordingName(at, session) + path.extname(file)};
}

function main(args, {dir = path.join(__dirname, '..', 'recordings'), log = console} = {}) {
  const dry = args.includes('--dry-run');
  let files = args.filter(a => !a.startsWith('--'));
  if (!files.length) {
    try {
      files = fs.readdirSync(dir).filter(n => isRecordingName(n) && n.startsWith('session-')).sort().map(n => path.join(dir, n));
    } catch (err) {
      files = [];
    }
  }
  if (!files.length) log.log('No recordings to rename');
  const trackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitwall-rename-')); // the dashboard may learn an outline: not into tracks-learned/
  let failed = 0;
  try {
    for (const file of files) {
      try {
        const r = newName(file, trackDir);
        const target = r.name && path.join(path.dirname(file), r.name);
        if (r.skipped) log.log(`${path.basename(file)}: ${r.skipped}`);
        else if (target === file) log.log(`${path.basename(file)}: already named`);
        else if (fs.existsSync(target)) log.log(`${path.basename(file)}: ${r.name} already exists`);
        else {
          if (!dry) fs.renameSync(file, target); // the file keeps its time: same place in the newest-first replay list
          log.log(`${path.basename(file)} -> ${r.name}${dry ? ' (dry run)' : ''}`);
        }
      } catch (err) {
        failed++;
        log.error(`Could not read ${file}: ${err.message}`);
      }
    }
  } finally {
    fs.rmSync(trackDir, {recursive: true, force: true});
  }
  return failed ? 1 : 0;
}

module.exports = {newName, main};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
