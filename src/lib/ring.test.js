import { describe, it, expect } from "vitest"
import { ringSegments, arcPath } from "./ring"

describe("ringSegments", () => {
  it("returns nothing for zero or invalid totals", () => {
    expect(ringSegments(0)).toEqual([])
    expect(ringSegments(-2)).toEqual([])
    expect(ringSegments(Number.NaN)).toEqual([])
  })

  it("draws a single near-full circle for one question", () => {
    expect(ringSegments(1)).toEqual([{ start: 0, end: 359.9 }])
  })

  it("splits the circle evenly with a gap between segments", () => {
    const segs = ringSegments(3)
    expect(segs).toHaveLength(3)
    expect(segs[0].start).toBeCloseTo(5)
    expect(segs[0].end).toBeCloseTo(115)
    expect(segs[1].start).toBeCloseTo(125)
    expect(segs[2].end).toBeCloseTo(355)
  })

  it("keeps segments in order and never overlapping for 10 questions", () => {
    const segs = ringSegments(10)
    expect(segs).toHaveLength(10)
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeGreaterThan(segs[i - 1].end)
  })
})

describe("arcPath", () => {
  it("draws a quarter turn clockwise from the top", () => {
    expect(arcPath(50, 50, 10, 0, 90)).toBe("M 50.00 40.00 A 10 10 0 0 1 60.00 50.00")
  })

  it("flags arcs longer than half a circle as large", () => {
    expect(arcPath(50, 50, 10, 0, 270)).toContain("A 10 10 0 1 1")
  })
})