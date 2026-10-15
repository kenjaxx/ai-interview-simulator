import { describe, it, expect } from "vitest"
import { computeBaseline, baselineFromStats } from "./baseline"
import { computeStatsFromSessions } from "./stats"

const session = (mode, content, clarity, confidence, overall) => ({
  mode,
  averages: { content, clarity, confidence, overall },
})

describe("computeBaseline", () => {
  it("returns null when there is nothing to compare", () => {
    expect(computeBaseline([], "full")).toBeNull()
    expect(computeBaseline(undefined, "full")).toBeNull()
  })

  it("only counts sessions in the same mode", () => {
    const sessions = [session("practice", 90, 90, 90, 90)]
    expect(computeBaseline(sessions, "full")).toBeNull()
  })

  it("averages each score across matching sessions", () => {
    const sessions = [
      session("full", 80, 60, 70, 70),
      session("practice", 10, 10, 10, 10),
      session("full", 60, 80, 50, 63),
    ]
    expect(computeBaseline(sessions, "full")).toEqual({
      count: 2,
      content: 70,
      clarity: 70,
      confidence: 60,
      overall: 67,
    })
  })
})

describe("baselineFromStats", () => {
  const sessions = [
    session("full", 80, 60, 70, 70),
    session("practice", 10, 10, 10, 10),
    session("full", 60, 80, 50, 63),
  ]
  const stats = computeStatsFromSessions(sessions)

  it("matches computeBaseline", () => {
    expect(baselineFromStats(stats, "full")).toEqual(computeBaseline(sessions, "full"))
  })

  it("can leave out the session that was just saved", () => {
    const justSaved = sessions[2].averages
    expect(baselineFromStats(stats, "full", justSaved)).toEqual(computeBaseline([sessions[0]], "full"))
  })

  it("returns null when only the excluded session exists", () => {
    const only = computeStatsFromSessions([sessions[0]])
    expect(baselineFromStats(only, "full", sessions[0].averages)).toBeNull()
    expect(baselineFromStats(only, "practice")).toBeNull()
  })
})