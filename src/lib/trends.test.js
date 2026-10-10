import { describe, it, expect } from "vitest"
import { computeTrends, summarizeSessions, chronologicalSlice } from "./trends"

const session = (content, clarity, confidence, overall) => ({
  averages: { content, clarity, confidence, overall },
})

describe("computeTrends", () => {
  it("needs at least two sessions", () => {
    expect(computeTrends([])).toBeNull()
    expect(computeTrends([session(50, 50, 50, 50)])).toBeNull()
  })

  it("compares the latest session with the one before", () => {
    const trends = computeTrends([session(50, 60, 70, 60), session(70, 55, 70, 65)])

    expect(trends.w).toBe(1)
    const byKey = Object.fromEntries(trends.rows.map((r) => [r.key, r]))
    expect(byKey.content.delta).toBe(20)
    expect(byKey.clarity.delta).toBe(-5)
    expect(byKey.confidence.delta).toBe(0)
  })

  it("reports the weakest recent category", () => {
    const trends = computeTrends([session(80, 80, 80, 80), session(80, 40, 80, 67)])
    expect(trends.weakest.key).toBe("clarity")
  })
})

describe("summarizeSessions", () => {
  it("returns zeros when empty", () => {
    expect(summarizeSessions([])).toEqual({ average: 0, best: 0 })
  })

  it("returns the average and best overall score", () => {
    const result = summarizeSessions([session(0, 0, 0, 60), session(0, 0, 0, 80), session(0, 0, 0, 70)])
    expect(result).toEqual({ average: 70, best: 80 })
  })
})

describe("chronologicalSlice", () => {
  it("flips newest-first into oldest-first and keeps only the latest N", () => {
    expect(chronologicalSlice([5, 4, 3, 2, 1], 3)).toEqual([3, 4, 5])
  })

  it("does not mutate the input", () => {
    const input = [3, 2, 1]
    chronologicalSlice(input)
    expect(input).toEqual([3, 2, 1])
  })
})
