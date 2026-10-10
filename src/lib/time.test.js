import { describe, it, expect } from "vitest"
import { nextUtcMidnight, formatDuration } from "./time"

describe("nextUtcMidnight", () => {
  it("returns the start of the next UTC day", () => {
    const next = nextUtcMidnight(new Date(Date.UTC(2026, 0, 15, 12, 30)))
    expect(next.getTime()).toBe(Date.UTC(2026, 0, 16))
  })

  it("rolls over month ends", () => {
    const next = nextUtcMidnight(new Date(Date.UTC(2026, 0, 31, 23, 59)))
    expect(next.getTime()).toBe(Date.UTC(2026, 1, 1))
  })
})

describe("formatDuration", () => {
  it("formats minutes, hours, and both", () => {
    expect(formatDuration(5 * 60_000)).toBe("5 min")
    expect(formatDuration(60 * 60_000)).toBe("1 h")
    expect(formatDuration(90 * 60_000)).toBe("1 h 30 min")
  })

  it("never shows less than a minute", () => {
    expect(formatDuration(0)).toBe("1 min")
  })
})
