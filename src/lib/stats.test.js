import { describe, it, expect } from "vitest"
import {
  emptyStats,
  normalizeStats,
  addToStats,
  removeFromStats,
  computeStatsFromSessions,
  summarizeStats,
} from "./stats"

const avg = (content, clarity, confidence, overall) => ({ content, clarity, confidence, overall })

describe("addToStats", () => {
  it("accumulates per mode and tracks the best overall", () => {
    let stats = emptyStats()
    stats = addToStats(stats, "full", avg(80, 60, 70, 70))
    stats = addToStats(stats, "full", avg(60, 80, 50, 63))
    stats = addToStats(stats, "practice", avg(90, 90, 90, 90))

    expect(stats.full).toEqual({ count: 2, content: 140, clarity: 140, confidence: 120, overall: 133, best: 70 })
    expect(stats.practice.count).toBe(1)
    expect(stats.practice.best).toBe(90)
  })

  it("ignores an unknown mode", () => {
    const stats = emptyStats()
    expect(addToStats(stats, "weird", avg(1, 1, 1, 1))).toBe(stats)
  })
})

describe("removeFromStats", () => {
  const two = computeStatsFromSessions([
    { mode: "full", averages: avg(80, 60, 70, 70) },
    { mode: "full", averages: avg(60, 80, 50, 63) },
  ])

  it("subtracts a session and flags a possibly stale best", () => {
    const { stats, bestStale } = removeFromStats(two, "full", avg(80, 60, 70, 70))
    expect(stats.full).toMatchObject({ count: 1, overall: 63 })
    expect(bestStale).toBe(true)
  })

  it("does not flag the best when a lower session is removed", () => {
    const { stats, bestStale } = removeFromStats(two, "full", avg(60, 80, 50, 63))
    expect(stats.full.best).toBe(70)
    expect(bestStale).toBe(false)
  })

  it("resets the bucket when the last session goes", () => {
    const one = addToStats(emptyStats(), "practice", avg(50, 50, 50, 50))
    const { stats } = removeFromStats(one, "practice", avg(50, 50, 50, 50))
    expect(stats.practice).toEqual(emptyStats().practice)
  })
})

describe("summarizeStats", () => {
  const stats = computeStatsFromSessions([
    { mode: "full", averages: avg(0, 0, 0, 60) },
    { mode: "full", averages: avg(0, 0, 0, 80) },
    { mode: "practice", averages: avg(0, 0, 0, 90) },
  ])

  it("covers every mode for all", () => {
    expect(summarizeStats(stats, "all")).toEqual({ count: 3, average: 77, best: 90 })
  })

  it("covers one mode", () => {
    expect(summarizeStats(stats, "full")).toEqual({ count: 2, average: 70, best: 80 })
  })
})

describe("normalizeStats", () => {
  it("returns empty stats for junk", () => {
    expect(normalizeStats(null)).toEqual(emptyStats())
    expect(normalizeStats({ full: "x" })).toEqual(emptyStats())
  })
})