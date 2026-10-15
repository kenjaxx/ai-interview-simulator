// Geometry for the progress ring around the interviewer. Pure, so it can be tested without rendering.
// Angles are in degrees, 0 = top of the ring, going clockwise.

export const RING_CENTER = 50
export const RING_RADIUS = 47

// One { start, end } per question, with a small gap between neighbours.
export function ringSegments(total, maxGapDeg = 10) {
  const n = Math.floor(total)
  if (!(n > 0)) return []
  if (n === 1) return [{ start: 0, end: 359.9 }] // a full circle can't be drawn as a single arc

  const step = 360 / n
  const gap = Math.min(maxGapDeg, step * 0.3)
  return Array.from({ length: n }, (_, i) => ({
    start: i * step + gap / 2,
    end: (i + 1) * step - gap / 2,
  }))
}

// SVG path for an arc on a circle, clockwise from startDeg to endDeg.
export function arcPath(cx, cy, r, startDeg, endDeg) {
  const point = (deg) => {
    const a = (deg * Math.PI) / 180
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  }
  const [x0, y0] = point(startDeg)
  const [x1, y1] = point(endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}