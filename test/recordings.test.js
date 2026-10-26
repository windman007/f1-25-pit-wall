// Renaming old-named recordings after what they hold.
const {test, describe, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {FIXTURE} = require('./helpers');
const {main, newName} = require('../scripts/rename-recordings');
const {recordingName} = require('../build/shared');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitwall-rename-test-'));
after(() => fs.rmSync(dir, {recursive: true, force: true}));
const folder = () => fs.mkdtempSync(path.join(dir, 'd-'));
const quietLog = () => {
  const lines = [];
  return {lines, log: {log: m => lines.push(m), error: m => lines.push('ERROR ' + m)}};
};
// the fixture is a couple of seconds of Catalunya, started 2026-10-23T18:18:59.425Z
const STARTED = new Date('2026-10-23T18:18:59.425Z');
const catalunya = ext => recordingName(STARTED, {track: 'Catalunya', sessionType: 4, packetFormat: 2025}) + ext;
const withOld = (d, name = 'session-2026-10-23T18-18-59-425Z.jsonl') => {
  fs.copyFileSync(FIXTURE, path.join(d, name));
  return path.join(d, name);
};

describe('renaming recordings', () => {
  test('the new name comes from the session in the recording and when it started', () => {
    const d = folder();
    const r = newName(withOld(d), d);
    assert.equal(r.name, catalunya('.jsonl'));
    assert.match(r.name, /_Catalunya_[A-Za-z-]+_F1-25\.jsonl$/);
  });
  test('the command renames every old-named recording, keeping its time; --dry-run only says', () => {
    const d = folder();
    const old = withOld(d);
    const stamp = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(old, stamp, stamp);
    const dry = quietLog();
    assert.equal(main(['--dry-run'], {dir: d, log: dry.log}), 0);
    assert.deepEqual(fs.readdirSync(d), ['session-2026-10-23T18-18-59-425Z.jsonl'], 'nothing renamed');
    assert.equal(dry.lines[0], `session-2026-10-23T18-18-59-425Z.jsonl -> ${catalunya('.jsonl')} (dry run)`);
    const real = quietLog();
    assert.equal(main([], {dir: d, log: real.log}), 0);
    assert.deepEqual(fs.readdirSync(d), [catalunya('.jsonl')]);
    assert.equal(real.lines[0], `session-2026-10-23T18-18-59-425Z.jsonl -> ${catalunya('.jsonl')}`);
    assert.equal(fs.statSync(path.join(d, catalunya('.jsonl'))).mtime.getTime(), stamp.getTime(), 'same place in the replay list');
    const again = quietLog();
    assert.equal(main([], {dir: d, log: again.log}), 0);
    assert.deepEqual(again.lines, ['No recordings to rename'], 'new names are not touched again');
  });
  test('given files, any name is renamed; one that is already named, or whose new name is taken, is left alone', () => {
    const d = folder();
    const a = withOld(d, 'my lap.jsonl');
    const lines = quietLog();
    assert.equal(main([a], {dir: d, log: lines.log}), 0);
    assert.equal(lines.lines[0], `my lap.jsonl -> ${catalunya('.jsonl')}`);
    const named = path.join(d, catalunya('.jsonl'));
    const again = quietLog();
    main([named], {dir: d, log: again.log});
    assert.equal(again.lines[0], `${catalunya('.jsonl')}: already named`);
    const b = withOld(d, 'other.jsonl');
    const taken = quietLog();
    main([b], {dir: d, log: taken.log});
    assert.equal(taken.lines[0], `other.jsonl: ${catalunya('.jsonl')} already exists`);
    assert.ok(fs.existsSync(b), 'not overwritten, not removed');
  });
  test('no session in the recording, an unreadable file, or no recordings: reported, nothing renamed', () => {
    const d = folder();
    const none = path.join(d, 'session-nosession.jsonl');
    fs.writeFileSync(none, '{"type":"f1rec"}\n[0,"AA=="]\n');
    const bad = path.join(d, 'session-bad.f1rec');
    fs.writeFileSync(bad, 'not a recording');
    const lines = quietLog();
    assert.equal(main([], {dir: d, log: lines.log}), 1, 'an unreadable file fails the run');
    assert.equal(lines.lines.length, 2);
    assert.ok(lines.lines.includes('session-nosession.jsonl: no session in this recording'));
    assert.ok(lines.lines.some(l => l.startsWith(`ERROR Could not read ${bad}: `)), lines.lines.join('\n'));
    assert.deepEqual(fs.readdirSync(d).sort(), ['session-bad.f1rec', 'session-nosession.jsonl']);
    const empty = quietLog();
    assert.equal(main([], {dir: path.join(d, 'missing'), log: empty.log}), 0);
    assert.deepEqual(empty.lines, ['No recordings to rename']);
  });
  test('a header without a usable start time falls back to the file time', () => {
    const d = folder();
    const f = path.join(d, 'session-x.jsonl');
    fs.writeFileSync(f, fs.readFileSync(FIXTURE, 'utf8').replace(/"startedAt":"[^"]*"/, '"startedAt":"nonsense"'));
    const when = new Date(2026, 5, 7, 8, 9, 10);
    fs.utimesSync(f, when, when);
    assert.match(newName(f, d).name, /^2026-06-07_08-09-10_Catalunya_/);
  });
});
