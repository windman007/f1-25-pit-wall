// Canvas drawing as pure functions: called with a fake 2D context that logs every call.
import {describe, expect, test} from 'vitest';
import type {DistPoint, LapTraces, Motion, TimePoint} from '@shared';
import {drawCompareChart, type CompareChartInput} from '../src/charts/compareChart';
import {drawPedalTrace} from '../src/charts/pedalTrace';
import {AERO_ZONE_COLOR, BOOST_MARK_COLOR, DRS_ZONE_COLOR, drawTrackMap} from '../src/charts/trackMap';
import {buffers, ingest, resetBuffers} from '../src/telemetry/buffers';
import {dashboardState, demoRivals, fakeContext} from './helpers';

const strokes = (log: unknown[][]) => log.filter(c => c[0] === 'set' && c[1] === 'strokeStyle').map(c => c[2]);

describe('track map', () => {
  test('learns the circuit from every car and draws rivals with labels', () => {
    resetBuffers();
    const s = dashboardState();
    ingest(s, {selected: null, compareOpen: false}, 0);
    const {ctx, labels} = fakeContext();
    drawTrackMap(ctx, 400, 300, {track: buffers.track, rivals: s.rivals!, car: buffers.car, session: s.session});
    expect(labels()).toContain('VER');
    expect(labels()).toContain('NOR');
    expect(labels(), 'your car is the white dot, not a label').not.toContain('YOU');
  });
  test('waits for cars before there is anything to draw', () => {
    const {ctx, labels} = fakeContext();
    drawTrackMap(ctx, 400, 300, {track: new Map(), rivals: [], car: null, session: null});
    expect(labels()).toEqual(['WAITING FOR CARS ON TRACK']);
  });
  test('draws active aero and DRS zones', () => {
    resetBuffers();
    const s = dashboardState();
    // a full lap of the demo field, so the outline covers both zones
    for (let t = 0; t < 30000; t += 100) ingest({...s, rivals: demoRivals(t, 1)}, {selected: null, compareOpen: false}, t);
    let f = fakeContext();
    drawTrackMap(f.ctx, 400, 300, {track: buffers.track, rivals: s.rivals!, car: null, session: s.session});
    expect(strokes(f.log)).toContain(AERO_ZONE_COLOR);
    expect(strokes(f.log)).toContain(DRS_ZONE_COLOR);
    f = fakeContext();
    drawTrackMap(f.ctx, 400, 300, {track: buffers.track, rivals: s.rivals!, car: null, session: {...s.session!, aeroZones: [], drsZones: []}});
    expect(strokes(f.log)).not.toContain(AERO_ZONE_COLOR);
    expect(strokes(f.log)).not.toContain(DRS_ZONE_COLOR);
  });
  test('format 2026 has no DRS: active aero zones, and the boost detection point as a bar across the track', () => {
    resetBuffers();
    const s = dashboardState();
    for (let t = 0; t < 30000; t += 100) ingest({...s, rivals: demoRivals(t, 1)}, {selected: null, compareOpen: false}, t);
    const colours = (extra: object) => {
      const f = fakeContext();
      drawTrackMap(f.ctx, 400, 300, {track: buffers.track, rivals: s.rivals!, car: null, session: s.session, ...extra});
      return {strokes: strokes(f.log), log: f.log};
    };
    const y26 = colours({format: 2026});
    expect(y26.strokes).toContain(AERO_ZONE_COLOR);
    expect(y26.strokes, 'no DRS in 2026').not.toContain(DRS_ZONE_COLOR);
    expect(colours({format: 2025}).strokes, 'DRS before 2026').toContain(DRS_ZONE_COLOR);
    expect(colours({}).strokes, 'format unknown: as before').toContain(DRS_ZONE_COLOR);
    expect(y26.strokes, 'detection point not known yet').not.toContain(BOOST_MARK_COLOR);
    const marked = colours({format: 2026, boost: 1500});
    expect(marked.strokes).toContain(BOOST_MARK_COLOR);
    expect(marked.log.filter(c => c[0] === 'stroke').length, 'the bar is one more stroke pair').toBe(y26.log.filter(c => c[0] === 'stroke').length + 2);
    expect(colours({format: 2025, boost: 1500}).strokes, 'no boost mode before 2026').not.toContain(BOOST_MARK_COLOR);
    expect(colours({format: 2026, boost: 99999}).strokes, 'a distance with no outline near it: nothing').not.toContain(BOOST_MARK_COLOR);
    expect(colours({format: 2026, boost: 1500, track: new Map()}).strokes, 'no outline: nothing').not.toContain(BOOST_MARK_COLOR);
  });
});

describe('pedal trace', () => {
  test('draws throttle and brake, nothing from a single sample', () => {
    let f = fakeContext();
    drawPedalTrace(f.ctx, 300, 100, [{t: 0, thr: 1, brk: 0, ld: null}], 0);
    expect(f.log.filter(c => c[0] === 'fill').length).toBe(0);
    f = fakeContext();
    drawPedalTrace(f.ctx, 300, 100, [{t: 0, thr: 1, brk: 0, ld: null}, {t: 50, thr: 0.5, brk: 0.2, ld: null}], 100);
    expect(strokes(f.log)).toContain('rgb(31, 209, 102)');
    expect(strokes(f.log)).toContain('rgb(255, 45, 31)');
  });
});

describe('compare chart', () => {
  const pt = (d: number, mode: number | null = 2, ers: number | null = 0.5): DistPoint => ({d, speed: 200, thr: 1, brk: 0, gear: 6, ers, mode, ld: d});
  const laps = (lt: Partial<LapTraces>): LapTraces => ({lap: 99, cur: [], last: [], lastLap: null, best: [], bestLap: null, bestTime: 0, invalid: false, ...lt});
  const input = (o: Partial<CompareChartInput>): CompareChartInput => ({
    slots: [], metric: 'speed', axis: 'dist', lapView: 'last', window: 20, trackLength: 5000, format: 2026, hoverX: null, now: 0, ...o,
  });
  const draw = (o: Partial<CompareChartInput>) => {
    const f = fakeContext();
    drawCompareChart(f.ctx, 600, 200, input(o));
    return f;
  };
  // a step: two lineTo calls in a row at the same x (across, then straight up or down)
  const steps = (log: unknown[][]) =>
    log.filter((c, i) => i && c[0] === 'lineTo' && log[i - 1][0] === 'lineTo' && c[1] === log[i - 1][1] && c[2] !== log[i - 1][2]).length;

  test('battery and ERS mode charts', () => {
    const you = {name: 'YOU', trail: undefined, laps: laps({last: [pt(0, 1), pt(50, 1), pt(100, 3)]})};
    let f = draw({slots: [you], metric: 'ers'});
    expect(f.labels(), 'battery axis in percent').toContain('50%');
    expect(steps(f.log), 'the battery charge is a plain line').toBe(0);
    f = draw({slots: [you], metric: 'mode'});
    expect(f.labels().filter(l => ['NONE', 'MED', 'HOT', 'BOOST', 'OT'].includes(l)), 'short labels, 2026 names').toEqual(['NONE', 'MED', 'HOT', 'BOOST']);
    expect(steps(f.log), 'the deploy mode changes as a step, not a ramp').toBe(1);

    // hovering both drivers: values, but no meaningless "+1" for a category
    const nor = {name: 'NORRIS', trail: undefined, laps: laps({last: [pt(0), pt(50), pt(100)]})};
    f = draw({slots: [you, nor], metric: 'mode', hoverX: 46});
    expect(f.labels(), 'the hover readout names the mode').toContain('Hotlap');
    expect(f.labels().some(l => /^[+−±]\d/.test(l)), 'no delta for the deploy mode').toBe(false);
    f = draw({slots: [you, nor], metric: 'ers', hoverX: 46});
    expect(f.labels(), 'the battery does get a delta').toContain('±0%');
  });
  test('an unknown battery breaks the line instead of dropping to 0 %', () => {
    const moveTos = (log: unknown[][]) => log.filter(c => c[0] === 'moveTo').length;
    const whole = moveTos(draw({slots: [{name: 'A', trail: undefined, laps: laps({last: [pt(0), pt(20), pt(40), pt(60)]})}], metric: 'ers'}).log);
    const f = draw({slots: [{name: 'A', trail: undefined, laps: laps({last: [pt(0), pt(20, null, null), pt(40), pt(60)]})}], metric: 'ers'});
    expect(moveTos(f.log), 'one break in the line').toBe(whole + 1);
    expect(f.log.some(c => (c[0] === 'lineTo' || c[0] === 'moveTo') && Number.isNaN(c[2])), 'no NaN points').toBe(false);
  });
  test('the best lap', () => {
    let f = draw({lapView: 'best', slots: [{name: 'A', trail: undefined, laps: laps({})}]});
    expect(f.labels()).toContain('NO FULL VALID LAP RECORDED YET');
    f = draw({lapView: 'best', slots: [{name: 'A', trail: undefined, laps: laps({best: [pt(0), pt(50), pt(100)], bestLap: 3, bestTime: 90000})}]});
    expect(f.labels()).not.toContain('NO FULL VALID LAP RECORDED YET');
    expect(strokes(f.log).filter(c => c === '#ff2d1f').length, 'the best lap is drawn').toBe(1);
  });
  test('the live trace draws only the chosen window of the 3 minutes kept', () => {
    const now = 200000;
    const trail: TimePoint[] = Array.from({length: 180}, (_, i) => ({t: now - (179 - i) * 1000, speed: 200, thr: 1, brk: 0, gear: 6, ers: 0.5, mode: 2, ld: null}));
    const slot = {name: 'YOU', trail, laps: undefined};
    const run = (window: number) => {
      const f = draw({axis: 'time', window, slots: [slot], now});
      // trace points left of the plot area would be drawn over the axis labels
      return {labels: f.labels(), offPlot: f.log.filter(c => c[0] === 'lineTo' && (c[1] as number) < 40).length, points: f.log.filter(c => c[0] === 'lineTo').length};
    };
    const short = run(20);
    expect(short.labels).toContain('-20s');
    expect(short.labels).not.toContain('-1:00');
    expect(short.offPlot, 'only the window is drawn').toBe(0);
    const long = run(180);
    expect(long.labels).toContain('-3:00');
    expect(long.labels).toContain('-30s');
    expect(long.points, 'the whole 3 minutes is drawn').toBeGreaterThan(short.points + 100);
  });
});

describe('corners', () => {
  // official corners on a 3323 m lap
  const CORNERS = [{n: '1', d: 220}, {n: '2', d: 612}, {n: '13', d: 2540}, {n: '14', d: 2572}];
  const RING: [number, number, number][] = Array.from({length: 416}, (_, k) => [k, Math.round(Math.cos(k / 66.2) * 400), Math.round(Math.sin(k / 66.2) * 250)]);
  const ring = () => new Map(RING.map(([k, x, z]) => [k, {x, z}]));

  test('the map numbers the corners beside the outline, close ones apart', () => {
    const f = fakeContext();
    drawTrackMap(f.ctx, 400, 300, {track: ring(), rivals: [], car: null, session: null, corners: CORNERS});
    expect(f.labels().filter(t => /^\d+$/.test(t))).toEqual(['1', '2', '13', '14']);
    const pos = (n: string) => f.log.find(c => c[0] === 'fillText' && c[1] === n)!.slice(2, 4) as number[];
    const [a, b] = [pos('13'), pos('14')];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1]), "close corners (13, 14) don't sit on top of each other").toBeGreaterThanOrEqual(16);
  });
  test('the map can be turned about its centre, clockwise, and is fitted to the canvas again', () => {
    const carAt = (rotation?: number) => {
      const f = fakeContext();
      drawTrackMap(f.ctx, 400, 300, {track: ring(), rivals: [], car: {x: 400, z: 0} as Motion, session: null, rotation});
      const [, x, y] = f.log.find(c => c[0] === 'arc' && c[3] === 7)!; // the car's circle
      return [x, y] as number[];
    };
    const [x0, y0] = carAt();
    expect(x0, 'no rotation: the car is at the right end, as before').toBeGreaterThan(300);
    expect(carAt(0)).toEqual([x0, y0]);
    const [x90, y90] = carAt(90);
    expect(x90, 'a quarter turn clockwise: right becomes bottom').toBeCloseTo(200, 3);
    expect(y90).toBeGreaterThan(250);
    const [x180, y180] = carAt(180);
    expect([x180 + x0, y180 + y0], 'a half turn mirrors it through the centre').toEqual([400, 300].map(v => expect.closeTo(v, 3)));
    expect(carAt(360)).toEqual([x0, y0].map(v => expect.closeTo(v, 6)));
  });
  test('the compare distance chart marks the corners; the hover names the one under the cursor', () => {
    const corners = [...CORNERS, {n: '15', d: 2580}];
    const base: CompareChartInput = {slots: [], metric: 'speed', axis: 'dist', lapView: 'last', window: 20, trackLength: 3323, corners, format: 2026, hoverX: null, now: 0};
    let f = fakeContext();
    drawCompareChart(f.ctx, 852, 200, base); // 800 px of plot for 3323 m
    expect(f.labels().filter(l => corners.some(c => c.n === l)), '14 and 15 are too close to 13 for their own labels').toEqual(['1', '2', '13']);
    expect(f.labels().filter(l => /^T\d/.test(l)), 'plain numbers, no T prefix').toEqual([]);
    const laps: LapTraces = {lap: 9, cur: [], last: [{d: 600, speed: 90, thr: 0, brk: 1, gear: 2, ers: 0.5, mode: 1, ld: 600}], lastLap: 8, best: [], bestLap: null, bestTime: 0, invalid: false};
    f = fakeContext();
    drawCompareChart(f.ctx, 852, 200, {...base, slots: [{name: 'YOU', trail: undefined, laps}], hoverX: 44 + (610 / 3323) * 800});
    expect(f.labels()).toContain('610 m · 2');
  });
  test('time charts mark where the car went through each corner', () => {
    const now = 10000;
    let f = fakeContext();
    const pedals = [190, 205, 215, 225, 240].map((ld, i) => ({t: now - 4000 + i * 100, thr: 1, brk: 0, ld}));
    drawPedalTrace(f.ctx, 300, 80, pedals, now, {corners: CORNERS, trackLength: 3323});
    expect(f.labels()).toEqual(['1']);
    // compare's live time chart: the reference driver's passes
    const trail: TimePoint[] = [600, 610, 620, 2530, 2545, 2575].map((ld, i) => ({t: now - 9000 + i * 1000, speed: 100, thr: 1, brk: 0, gear: 4, ers: 0.5, mode: 1, ld}));
    f = fakeContext();
    drawCompareChart(f.ctx, 600, 200, {slots: [{name: 'YOU', trail, laps: undefined}], metric: 'speed', axis: 'time', lapView: 'cur', window: 20, trackLength: 3323, corners: CORNERS, format: 2026, hoverX: null, now});
    expect(f.labels().filter(l => CORNERS.some(c => c.n === l))).toEqual(['2', '13', '14']);
  });
});
