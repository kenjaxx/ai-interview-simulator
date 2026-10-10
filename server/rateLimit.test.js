import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"
import { consumeRequest, peekUsage, RATE_LIMITS } from "./rateLimit.js"

// These run against the in-memory store (no Upstash env vars in tests). Time is frozen so the
// per-minute burst window can't flake, and every test uses its own uid.

const { DAILY_LIMIT, BURST_LIMIT, REFUND_CAP } = RATE_LIMITS
const BASE = Date.UTC(2026, 0, 15, 12, 0, 0) // midday UTC, so no test crosses midnight
const WINDOW_MS = 61_000 // just over one burst window

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {}) // silence the "in-memory limits" warning
})

afterEach(() => {
  vi.useRealTimers()
})

function freezeAt(offsetMs = 0) {
  vi.useFakeTimers()
  vi.setSystemTime(BASE + offsetMs)
}

describe("consumeRequest", () => {
  it("allows a first request and reports what is left", async () => {
    freezeAt()
    const result = await consumeRequest("u-first")

    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(DAILY_LIMIT)
    expect(result.remaining).toBe(DAILY_LIMIT - 1)
  })

  it("blocks rapid-fire requests inside one minute", async () => {
    freezeAt()
    for (let i = 0; i < BURST_LIMIT; i++) {
      expect((await consumeRequest("u-burst")).allowed).toBe(true)
    }

    const blocked = await consumeRequest("u-burst")
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe("user_burst")
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it("does not charge a denied request", async () => {
    freezeAt()
    for (let i = 0; i < BURST_LIMIT; i++) await consumeRequest("u-denied")
    await consumeRequest("u-denied") // denied: must be rolled back

    freezeAt(WINDOW_MS) // next burst window
    const next = await consumeRequest("u-denied")
    expect(next.allowed).toBe(true)
    expect(next.remaining).toBe(DAILY_LIMIT - (BURST_LIMIT + 1))
  })

  it("blocks after the daily limit", async () => {
    for (let i = 0; i < DAILY_LIMIT; i++) {
      freezeAt(i * WINDOW_MS) // a new burst window each time, so only the daily limit can trigger
      expect((await consumeRequest("u-daily")).allowed).toBe(true)
    }

    freezeAt(DAILY_LIMIT * WINDOW_MS)
    const blocked = await consumeRequest("u-daily")
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe("user_daily")
  })

  it("keeps users separate", async () => {
    freezeAt()
    for (let i = 0; i < BURST_LIMIT; i++) await consumeRequest("u-a")
    expect((await consumeRequest("u-a")).allowed).toBe(false)
    expect((await consumeRequest("u-b")).allowed).toBe(true)
  })
})

describe("refunds", () => {
  it("gives the evaluation back, but only once", async () => {
    freezeAt()
    const first = await consumeRequest("u-refund")
    expect(first.remaining).toBe(DAILY_LIMIT - 1)

    expect(await first.refund({ capped: false })).toBe(true)
    expect(await first.refund({ capped: false })).toBe(false)

    const second = await consumeRequest("u-refund")
    expect(second.remaining).toBe(DAILY_LIMIT - 1) // the first one was refunded
  })

  it("stops refunding ambiguous failures after the daily cap", async () => {
    for (let i = 0; i < REFUND_CAP + 1; i++) {
      freezeAt(i * WINDOW_MS)
      const reservation = await consumeRequest("u-cap")
      const refunded = await reservation.refund({ capped: true })
      expect(refunded).toBe(i < REFUND_CAP)
    }
  })
})

describe("peekUsage", () => {
  it("reads usage without spending any", async () => {
    freezeAt()
    await consumeRequest("u-peek")
    await consumeRequest("u-peek")

    const before = await peekUsage("u-peek")
    const after = await peekUsage("u-peek")

    expect(before.remaining).toBe(DAILY_LIMIT - 2)
    expect(after.remaining).toBe(before.remaining)
    expect(before.limit).toBe(DAILY_LIMIT)
    expect(before.globalExhausted).toBe(false)
  })
})
