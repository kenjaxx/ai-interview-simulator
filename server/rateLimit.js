// Request limits for /api/evaluate. Three counters are checked on every request:
//
//   1. per user, per UTC day     - stops one account from burning your Gemini quota
//   2. per user, per minute      - stops rapid-fire / parallel bursts
//   3. all users, per UTC day    - a hard cost ceiling for the whole app
//
// Plus a fourth counter that only limits REFUNDS (see refund() below).
//
// Storage: Upstash Redis over its REST API (no extra npm dependency). Serverless functions don't
// share memory, so a real shared store is required for the limits to actually hold.
// If the Upstash env vars are missing, a per-instance in-memory fallback is used. That is only
// good enough for local development: every cold start resets it and instances don't share it.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const DAILY_LIMIT = intFromEnv("RATE_LIMIT_DAILY", 10) // per user, per UTC day
const BURST_LIMIT = intFromEnv("RATE_LIMIT_BURST", 3) // per user, per BURST_WINDOW_SEC
const GLOBAL_DAILY_LIMIT = intFromEnv("RATE_LIMIT_GLOBAL_DAILY", 500) // whole app, per UTC day
// How many "ambiguous" failures (timeouts, cut-off or unreadable AI output) get refunded per user
// per day. Clear provider-side failures (502/503/429 from Gemini) are always refunded and don't
// count toward this. The cap exists so crafted input can't be used to farm free requests.
const REFUND_CAP = intFromEnv("RATE_LIMIT_REFUND_CAP", 5)
const BURST_WINDOW_SEC = 60
const DAY_TTL_SEC = 25 * 60 * 60 // a little over a day so keys clean themselves up

// ---------- storage backends (same interface) ----------
//   incr(items: [{ key, ttlSec }]) -> number[]   increments each key, sets expiry on first use
//   decr(keys: string[])           -> void       best-effort rollback / refund

async function redisPipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`Upstash responded with ${res.status}`)
  const data = await res.json()
  return data.map((entry) => {
    if (entry.error) throw new Error(entry.error)
    return entry.result
  })
}

const redisStore = {
  async incr(items) {
    const commands = items.flatMap(({ key, ttlSec }) => [
      ["INCR", key],
      ["EXPIRE", key, String(ttlSec), "NX"],
    ])
    const results = await redisPipeline(commands)
    return items.map((_, i) => Number(results[i * 2]))
  },
  async decr(keys) {
    await redisPipeline(keys.map((key) => ["DECR", key]))
  },
  // Read-only: current counts without incrementing anything.
  async get(keys) {
    const results = await redisPipeline(keys.map((key) => ["GET", key]))
    return results.map((value) => Number(value) || 0)
  },
}

const memory = new Map()
const memoryStore = {
  async incr(items) {
    const now = Date.now()
    for (const [key, entry] of memory) {
      if (entry.expiresAt <= now) memory.delete(key)
    }
    return items.map(({ key, ttlSec }) => {
      const entry = memory.get(key) || { count: 0, expiresAt: now + ttlSec * 1000 }
      entry.count++
      memory.set(key, entry)
      return entry.count
    })
  },
  async decr(keys) {
    for (const key of keys) {
      const entry = memory.get(key)
      if (entry && entry.count > 0) entry.count--
    }
  },
  async get(keys) {
    const now = Date.now()
    return keys.map((key) => {
      const entry = memory.get(key)
      return entry && entry.expiresAt > now ? entry.count : 0
    })
  },
}

let warnedAboutMemory = false
function getStore() {
  if (REDIS_URL && REDIS_TOKEN) return redisStore
  if (!warnedAboutMemory) {
    warnedAboutMemory = true
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. " +
        "Using per-instance in-memory limits, which are NOT reliable in production."
    )
  }
  return memoryStore
}

// ---------- helpers ----------

function secondsUntilUtcMidnight(now) {
  const d = new Date(now)
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now) / 1000))
}

function secondsUntilNextBurstWindow(now) {
  return BURST_WINDOW_SEC - (Math.floor(now / 1000) % BURST_WINDOW_SEC)
}

function keysFor(uid, now) {
  const day = new Date(now).toISOString().slice(0, 10)
  const burstBucket = Math.floor(now / (BURST_WINDOW_SEC * 1000))
  return {
    user: `rl:day:${day}:${uid}`,
    burst: `rl:burst:${burstBucket}:${uid}`,
    global: `rl:global:${day}`,
    refunds: `rl:refunds:${day}:${uid}`,
  }
}

// ---------- public API ----------

// Reserves one evaluation for this user.
//
// Allowed:  { allowed: true, remaining, limit, refund({ capped }) }
//           refund() gives the request back (call it when the request failed and the user got
//           nothing). It only touches the daily counters, never the burst counter, and it only
//           ever pays out once per reservation.
//             refund({ capped: false })  clear provider-side failure: always refunded.
//             refund({ capped: true })   ambiguous failure (timeout, cut-off / unreadable output):
//                                        refunded only while the user is under REFUND_CAP for the day.
//           Resolves to true if the request was refunded, false otherwise.
// Denied:   { allowed: false, reason: "user_daily" | "user_burst" | "global_daily", retryAfterSeconds }
//           A denied request does not consume anything, including the global budget.
//
// Throws if the storage backend can't be reached (the caller should fail closed).
export async function consumeRequest(uid) {
  const now = Date.now()
  const keys = keysFor(uid, now)
  const store = getStore()

  const [userCount, burstCount, globalCount] = await store.incr([
    { key: keys.user, ttlSec: DAY_TTL_SEC },
    { key: keys.burst, ttlSec: BURST_WINDOW_SEC * 2 },
    { key: keys.global, ttlSec: DAY_TTL_SEC },
  ])

  let denied = null
  if (userCount > DAILY_LIMIT) {
    denied = { reason: "user_daily", retryAfterSeconds: secondsUntilUtcMidnight(now) }
  } else if (burstCount > BURST_LIMIT) {
    denied = { reason: "user_burst", retryAfterSeconds: secondsUntilNextBurstWindow(now) }
  } else if (globalCount > GLOBAL_DAILY_LIMIT) {
    denied = { reason: "global_daily", retryAfterSeconds: secondsUntilUtcMidnight(now) }
  }

  if (denied) {
    await store.decr([keys.user, keys.burst, keys.global]).catch(() => {})
    return { allowed: false, ...denied }
  }

  let refunded = false
  return {
    allowed: true,
    remaining: Math.max(0, DAILY_LIMIT - userCount),
    limit: DAILY_LIMIT,
    refund: async ({ capped = false } = {}) => {
      if (refunded) return false
      try {
        if (capped) {
          const [used] = await store.incr([{ key: keys.refunds, ttlSec: DAY_TTL_SEC }])
          if (used > REFUND_CAP) return false
        }
        refunded = true
        await store.decr([keys.user, keys.global])
        return true
      } catch {
        return false // best effort: never let a refund problem break the error response
      }
    },
  }
}
// Reports how many evaluations a user has left WITHOUT spending one. Used by the setup screen's
// quota meter. Throws if the storage backend can't be reached.
export async function peekUsage(uid) {
  const keys = keysFor(uid, Date.now())
  const [userCount, globalCount] = await getStore().get([keys.user, keys.global])
  const globalExhausted = globalCount >= GLOBAL_DAILY_LIMIT
  const userRemaining = Math.max(0, DAILY_LIMIT - userCount)
  return {
    remaining: globalExhausted ? 0 : userRemaining,
    limit: DAILY_LIMIT,
    globalExhausted,
  }
}
export const RATE_LIMITS = { DAILY_LIMIT, BURST_LIMIT, GLOBAL_DAILY_LIMIT, REFUND_CAP }
