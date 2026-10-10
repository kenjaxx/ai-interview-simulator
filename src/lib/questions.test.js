import { describe, it, expect } from "vitest"
import { pickQuestions } from "./questions"
import { GENERAL_QUESTIONS, SENIORITY_QUESTIONS, ROLE_QUESTIONS } from "./questionBank"
import { ROLES, SENIORITIES } from "../../shared/options.js"

describe("question bank", () => {
  it("has enough questions for every role", () => {
    for (const role of ROLES) {
      expect(ROLE_QUESTIONS[role]?.length, `role "${role}"`).toBeGreaterThanOrEqual(3)
    }
  })

  it("has questions for every seniority", () => {
    for (const level of SENIORITIES) {
      expect(SENIORITY_QUESTIONS[level]?.length, `seniority "${level}"`).toBeGreaterThan(0)
    }
  })

  it("has no duplicate questions inside a list", () => {
    const lists = [GENERAL_QUESTIONS, ...Object.values(SENIORITY_QUESTIONS), ...Object.values(ROLE_QUESTIONS)]
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe("pickQuestions", () => {
  const role = "Frontend Developer"
  const level = "Mid-level"

  it("returns the requested number of unique questions", () => {
    const picked = pickQuestions(role, level, 6)
    expect(picked).toHaveLength(6)
    expect(new Set(picked).size).toBe(6)
  })

  it("never returns more than requested", () => {
    expect(pickQuestions(role, level, 2)).toHaveLength(2)
  })

  it("guarantees role-specific questions", () => {
    const roleSet = new Set(ROLE_QUESTIONS[role])
    const picked = pickQuestions(role, level, 6)
    expect(picked.filter((q) => roleSet.has(q)).length).toBeGreaterThanOrEqual(3)
  })

  it("puts custom questions first and cuts the bank role quota", () => {
    const custom = ["Custom A?", "Custom B?", "Custom C?"]
    const picked = pickQuestions(role, level, 6, { custom })

    expect(picked).toHaveLength(6)
    for (const q of custom) expect(picked).toContain(q)

    const roleSet = new Set(ROLE_QUESTIONS[role])
    expect(picked.filter((q) => roleSet.has(q))).toHaveLength(1)
  })

  it("prefers questions that were not asked recently", () => {
    const roleQs = ROLE_QUESTIONS[role]
    const recent = roleQs.slice(0, 4)
    const fresh = roleQs.slice(4) // 3 never-asked questions

    const picked = pickQuestions(role, level, 6, { recent })
    for (const q of fresh) expect(picked).toContain(q)
  })

  it("falls back to general questions for an unknown role", () => {
    const picked = pickQuestions("Not a role", "Not a level", 6)
    expect(picked).toHaveLength(6)
    for (const q of picked) expect(GENERAL_QUESTIONS).toContain(q)
  })
})
