import { describe, it, expect } from "vitest"
import { INTERVIEWERS, DEFAULT_INTERVIEWER, getInterviewer, isInterviewerId } from "./interviewers"

describe("interviewers", () => {
  it("has unique ids and names", () => {
    expect(new Set(INTERVIEWERS.map((p) => p.id)).size).toBe(INTERVIEWERS.length)
    expect(new Set(INTERVIEWERS.map((p) => p.name)).size).toBe(INTERVIEWERS.length)
  })

  it("recognizes valid ids only", () => {
    expect(isInterviewerId(DEFAULT_INTERVIEWER)).toBe(true)
    expect(isInterviewerId("nobody")).toBe(false)
    expect(isInterviewerId(undefined)).toBe(false)
  })

  it("falls back to the first interviewer for an unknown id", () => {
    expect(getInterviewer("nobody")).toBe(INTERVIEWERS[0])
    expect(getInterviewer("maya").name).toBe("Maya")
  })

  it("only uses hair styles the drawing knows about", () => {
    for (const p of INTERVIEWERS) expect(["short", "long", "bob"]).toContain(p.hairStyle)
  })

  it("gives every interviewer a complete voice", () => {
    for (const p of INTERVIEWERS) {
      expect(p.voice.names.length, p.name).toBeGreaterThan(0)
      expect(p.voice.lang, p.name).toMatch(/^en-[A-Z]{2}$/)
      expect(["male", "female"], p.name).toContain(p.voice.gender)
    }
  })

  it("matches the voices each interviewer was set up with", () => {
    expect(getInterviewer("alex").voice.names[0]).toBe("Google UK English Male")
    expect(getInterviewer("maya").voice.names[0]).toBe("Google UK English Female")
    expect(getInterviewer("daniel").voice.names[0]).toBe("Microsoft Mark - English (United States)")
    expect(getInterviewer("aiko").voice.names[0]).toBe("Google US English")
  })
})