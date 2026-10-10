import { describe, it, expect } from "vitest"
import { isBehavioral, matchesType } from "./questionTypes"
import { pickQuestions } from "./questions"
import { ROLE_QUESTIONS } from "./questionBank"

describe("isBehavioral", () => {
  it("flags past-experience questions", () => {
    expect(isBehavioral("Tell me about a time you missed a deadline.")).toBe(true)
    expect(isBehavioral("Describe a mistake you made at work.")).toBe(true)
    expect(isBehavioral("What's the most useful piece of feedback you've ever received?")).toBe(true)
  })

  it("does not flag how-to and design questions", () => {
    expect(isBehavioral("How would you design rate limiting for a public API?")).toBe(false)
    expect(isBehavioral("Walk me through how you'd safely roll out a schema change.")).toBe(false)
  })
})

describe("matchesType", () => {
  it("lets everything through for mixed", () => {
    expect(matchesType("Tell me about a time...", "mixed")).toBe(true)
    expect(matchesType("How does indexing work?", "mixed")).toBe(true)
  })
})

describe("pickQuestions with a type", () => {
  const role = "Backend Developer"

  it("behavioral sessions only contain behavioral questions", () => {
    const picked = pickQuestions(role, "Mid-level", 6, { type: "behavioral" })
    expect(picked).toHaveLength(6)
    for (const q of picked) expect(isBehavioral(q)).toBe(true)
  })

  it("technical sessions use the role's own technical questions first", () => {
    const roleSet = new Set(ROLE_QUESTIONS[role])
    const picked = pickQuestions(role, "Mid-level", 6, { type: "technical" })
    expect(picked).toHaveLength(6)
    for (const q of picked) {
      expect(roleSet.has(q)).toBe(true)
      expect(isBehavioral(q)).toBe(false)
    }
  })

  it("still returns the requested count when the bank runs short", () => {
    const picked = pickQuestions("A custom role", "Mid-level", 10, { type: "technical" })
    expect(picked).toHaveLength(10)
    expect(new Set(picked).size).toBe(10)
  })
})