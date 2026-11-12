// What a wheel event means in a flat view (the graph, the Draw tab). On a trackpad two
// fingers pan and a pinch zooms; a mouse wheel zooms. Browsers send both as wheel events:
// a pinch has ctrlKey set, and a trackpad scroll moves in x as well as y now and then, in
// small steps, where a mouse wheel moves in y only, in lines or in large even steps.

let lastTrackpad = 0;

// 'zoom' or 'pan'
export function wheelIntent(e) {
  if (e.ctrlKey || e.metaKey) return 'zoom';
  if (e.altKey) return 'zoom';
  if (e.deltaMode !== 0) return 'zoom';
  const now = performance.now();
  const small = Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY * 2);
  if (e.deltaX !== 0 || small) lastTrackpad = now;
  // a trackpad gesture seen in the last second: the stream it belongs to keeps panning
  return now - lastTrackpad < 1000 ? 'pan' : 'zoom';
}
