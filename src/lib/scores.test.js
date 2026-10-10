import { describe, it, expect } from "vitest"
import { averageScores, entryOverall, findWeakestIndex } from "./scores"

const entry = (contentScore, clarityScore, confidenceScore) => ({
  evaluation: { contentScore, clarityScore, confidenceScore },
})

describe("averageScores", () => {
  it("returns zeros for an empty session", () => {
    expect(averageScores([])).toEqual({ content: 0, clarity: 0, confidence: 0, overall: 0 })
    expect(averageScores(undefined)).toEqual({ content: 0, clarity: 0, confidence: 0, overall: 0 })
  })

  it("averages each category and rounds the overall", () => {
    const session = [entry(80, 60, 70), entry(90, 80, 50)]
    expect(averageScores(session)).toEqual({ content: 85, clarity: 70, confidence: 60, overall: 72 })
  })
})

describe("entryOverall", () => {
  it("averages the three scores for one answer", () => {
    expect(entryOverall(entry(80, 60, 70))).toBe(70)
    expect(entryOverall(entry(90, 80, 50))).toBe(73)
  })
})

describe("findWeakestIndex", () => {
  const session = [entry(80, 60, 70), entry(90, 80, 50), entry(40, 40, 40)]

  it("finds the lowest-scoring answer", () => {
    expect(findWeakestIndex(session)).toBe(2)
  })

  it("skips indexes that were already retried", () => {
    expect(findWeakestIndex(session, new Set([2]))).toBe(0)
  })

  it("returns -1 when nothing qualifies", () => {
    expect(findWeakestIndex([])).toBe(-1)
    expect(findWeakestIndex(session, new Set([0, 1, 2]))).toBe(-1)
  })
})
