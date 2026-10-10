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
//
// Atomicity: checking the limits and spending a request happens inside ONE Lua script on the Redis
// server, so two parallel requests can never both slip under a limit, and a denied request never
// touches a counter (there is no increment-then-roll-back). Refunds are one script as well.
//
// If the Upstash env vars are missing, a per-instance in-memory fallback is used. That is only
// good enough for local development: every cold start resets it and instances don't share it.
// It implements the same operations, and since JavaScript is single-threaded each one is atomic too.

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

// Index = the code the reserve script returns. 0 means allowed.
const DENIED_REASONS = [null, "user_daily", "user_burst", "global_daily"]

// ---------- Lua scripts (run atomically inside Redis) ----------

// KEYS: user-day, user-burst, global-day
// ARGV: dailyLimit, burstLimit, globalLimit, dayTtlSec, burstTtlSec
// Returns { code, userCount }. Counters are only incremented when ALL three limits have room.
// TTL is set when a key has none yet (same effect as EXPIRE ... NX, but works on older Redis).
const RESERVE_SCRIPT = `
local u = tonumber(redis.call('GET', KEYS[1])) or 0
local b = tonumber(redis.call('GET', KEYS[2])) or 0
local g = tonumber(redis.call('GET', KEYS[3])) or 0

if u >= tonumber(ARGV[1]) then return {1, u} end
if b >= tonumber(ARGV[2]) then return {2, u} end
if g >= tonumber(ARGV[3]) then return {3, u} end

local ttls = {ARGV[4], ARGV[5], ARGV[4]}
for i = 1, 3 do
  redis.call('INCR', KEYS[i])
  if redis.call('TTL', KEYS[i]) < 0 then
    redis.call('EXPIRE', KEYS[i], ttls[i])
  end
end
return {0, u + 1}
`

// KEYS: refunds-day, user-day, global-day
// ARGV: cap (-1 = uncapped), refundsTtlSec
// Returns 1 if the request was refunded, 0 if the daily refund cap was hit.
// The user and global counters never go below zero.
const REFUND_SCRIPT = `
local cap = tonumber(ARGV[1])
if cap >= 0 then
  local n = redis.call('INCR', KEYS[1])
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  if n > cap then return 0 end
end
for i = 2, 3 do
  local c = tonumber(redis.call('GET', KEYS[i])) or 0
  if c > 0 then redis.call('DECR', KEYS[i]) end
end
return 1
`

// ---------- storage backends (same interface) ----------
//   reserve(keys, limits)  -> { denied: null | "user_daily" | "user_burst" | "global_daily", userCount }
//   refund(keys, { cap, ttlSec }) -> boolean   (cap -1 = uncapped)
//   get(keys: string[])    -> number[]         read-only counts

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
  async reserve(keys, limits) {
    const [result] = await redisPipeline([
      [
        "EVAL",
        RESERVE_SCRIPT,
        "3",
        keys.user,
        keys.burst,
        keys.global,
        String(limits.daily),
        String(limits.burst),
        String(limits.global),
        String(limits.dayTtlSec),
        String(limits.burstTtlSec),
      ],
    ])
    const [code, userCount] = result.map(Number)
    return { denied: DENIED_REASONS[code] ?? null, userCount }
  },
  async refund(keys, { cap, ttlSec }) {
    const [result] = await redisPipeline([
      ["EVAL", REFUND_SCRIPT, "3", keys.refunds, keys.user, keys.global, String(cap), String(ttlSec)],
    ])
    return Number(result) === 1
  },
  // Read-only: current counts without incrementing anything.
  async get(keys) {
    const results = await redisPipeline(keys.map((key) => ["GET", key]))
    return results.map((value) => Number(value) || 0)
  },
}

const memory = new Map()

function sweepExpired(now) {
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key)
  }
}
function readCount(key, now) {
  const entry = memory.get(key)
  return entry && entry.expiresAt > now ? entry.count : 0
}
function bump(key, ttlSec, now) {
  const entry = memory.get(key)
  if (entry && entry.expiresAt > now) {
    entry.count++
    return entry.count
  }
  memory.set(key, { count: 1, expiresAt: now + ttlSec * 1000 })
  return 1
}
function drop(key, now) {
  const entry = memory.get(key)
  if (entry && entry.expiresAt > now && entry.count > 0) entry.count--
}

const memoryStore = {
  async reserve(keys, limits) {
    const now = Date.now()
    sweepExpired(now)

    const userCount = readCount(keys.user, now)
    const burstCount = readCount(keys.burst, now)
    const globalCount = readCount(keys.global, now)

    if (userCount >= limits.daily) return { denied: "user_daily", userCount }
    if (burstCount >= limits.burst) return { denied: "user_burst", userCount }
    if (globalCount >= limits.global) return { denied: "global_daily", userCount }

    bump(keys.burst, limits.burstTtlSec, now)
    bump(keys.global, limits.dayTtlSec, now)
    return { denied: null, userCount: bump(keys.user, limits.dayTtlSec, now) }
  },
  async refund(keys, { cap, ttlSec }) {
    const now = Date.now()
    if (cap >= 0 && bump(keys.refunds, ttlSec, now) > cap) return false
    drop(keys.user, now)
    drop(keys.global, now)
    return true
  },
  async get(keys) {
    const now = Date.now()
    return keys.map((key) => readCount(key, now))
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

  const { denied, userCount } = await store.reserve(keys, {
    daily: DAILY_LIMIT,
    burst: BURST_LIMIT,
    global: GLOBAL_DAILY_LIMIT,
    dayTtlSec: DAY_TTL_SEC,
    burstTtlSec: BURST_WINDOW_SEC * 2,
  })

  if (denied) {
    return {
      allowed: false,
      reason: denied,
      retryAfterSeconds: denied === "user_burst" ? secondsUntilNextBurstWindow(now) : secondsUntilUtcMidnight(now),
    }
  }

  let settled = false
  return {
    allowed: true,
    remaining: Math.max(0, DAILY_LIMIT - userCount),
    limit: DAILY_LIMIT,
    refund: async ({ capped = false } = {}) => {
      if (settled) return false
      settled = true // one attempt per reservation, so a reservation can never pay out twice
      try {
        return await store.refund(keys, { cap: capped ? REFUND_CAP : -1, ttlSec: DAY_TTL_SEC })
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