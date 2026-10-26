// Track map (canvas, drawn every frame) with the 2026 zone legend and your g-forces. The map can be spun: drag it
// (mouse or pen), or use the buttons; the angle is remembered per track.
import type {PointerEvent} from 'react';
import {memo} from 'react';
import {drawTrackMap} from '../../charts/trackMap';
import {useCanvasFrame} from '../../hooks/useCanvasFrame';
import {trackPointer} from '../../hooks/dom';
import {getServerState, useServer} from '../../store/dashboard';
import {SPIN_STEP, rotationOf, setRotation, spinMap, useMapRotation} from '../../store/mapRotation';
import {buffers} from '../../telemetry/buffers';

export const MapPanel = memo(function MapPanel() {
  // 2026 has no DRS: the legend shows the active aero zones and the boost detection point instead
  const {aero, drs, detection, gLat, gLong} = useServer(s => {
    const is2026 = (s?.session?.packetFormat ?? 0) >= 2026;
    return {
      aero: !!s?.session?.aeroZones?.length,
      drs: !is2026 && !!s?.session?.drsZones?.length,
      detection: is2026 && s?.trackMap?.boost != null,
      gLat: s?.motion?.gLat,
      gLong: s?.motion?.gLong,
    };
  });
  const trackId = useServer(s => s?.session?.trackId ?? null);
  const angle = useMapRotation(s => (trackId == null ? 0 : s.angles[trackId] ?? 0));
  const ref = useCanvasFrame((ctx, w, h) => {
    const s = getServerState();
    drawTrackMap(ctx, w, h, {
      track: buffers.track,
      rivals: s?.rivals || [],
      car: buffers.car,
      session: s?.session,
      corners: buffers.corners,
      rotation: rotationOf(s?.session?.trackId),
      format: s?.session?.packetFormat,
      boost: s?.trackMap?.boost,
    });
  });

  // dragging turns the map by as much as the pointer moves around its centre
  const spin = (e: PointerEvent<HTMLCanvasElement>) => {
    if (trackId == null || e.button > 0 || e.pointerType === 'touch') return; // a finger scrolls the page
    const r = e.currentTarget.getBoundingClientRect();
    const around = (ev: {clientX: number; clientY: number}) =>
      (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    const from = around(e),
      start = rotationOf(trackId);
    trackPointer(e, {
      onMove: ev => setRotation(trackId, start + around(ev) - from, false),
      onEnd: () => setRotation(trackId, rotationOf(trackId)),
      bodyClass: 'spinning',
    });
  };
  return (
    <>
      <h2>
        <span>Track map</span>
        {(aero || drs || detection) && (
          <span className="maplegend">
            {aero && (
              <>
                <i className="lz aero" />
                ACTIVE AERO
              </>
            )}
            {drs && (
              <>
                <i className="lz drsz" />
                DRS
              </>
            )}
            {detection && (
              <>
                <i className="lz boostdet" />
                BOOST DETECTION
              </>
            )}
          </span>
        )}
        <span className="mapctl">
          {angle !== 0 && (
            <button type="button" className="maprst" title="Back to the game's orientation" onClick={() => setRotation(trackId!, 0)}>
              {angle}° ✕
            </button>
          )}
          <button type="button" title={`Turn the map ${SPIN_STEP}° anticlockwise`} aria-label="Rotate map anticlockwise" disabled={trackId == null} onClick={() => spinMap(trackId!, -SPIN_STEP)}>
            ↺
          </button>
          <button type="button" title={`Turn the map ${SPIN_STEP}° clockwise`} aria-label="Rotate map clockwise" disabled={trackId == null} onClick={() => spinMap(trackId!, SPIN_STEP)}>
            ↻
          </button>
        </span>
      </h2>
      <canvas ref={ref} className="mapcv" title="Drag to spin the map; double-click to turn it back" onPointerDown={spin} onDoubleClick={() => trackId != null && setRotation(trackId, 0)} />
      <div className="g">
        <span>
          G-LAT <b>{(gLat ?? 0).toFixed(1)}</b>
        </span>
        <span>
          G-LONG <b>{(gLong ?? 0).toFixed(1)}</b>
        </span>
      </div>
    </>
  );
});
