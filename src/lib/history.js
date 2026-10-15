import { app, ensureAppCheck } from "./firebase"
import { averageScores } from "./scores"
import {
  emptyStats,
  normalizeStats,
  addToStats,
  removeFromStats,
  computeStatsFromSessions,
} from "./stats"

// "firebase/firestore" is loaded on first use, so it stays out of the main bundle.
// Vite turns the dynamic import() below into its own chunk.
//
// Data model (per user):
//   users/{uid}/sessions/{id}              summary: role, seniority, mode, overallSummary, averages,
//                                          answerCount, createdAt   (small, so lists are cheap)
//   users/{uid}/sessions/{id}/details/qas  { qas: [...] }           (fetched only when a row is opened)
//   users/{uid}/stats/summary              rolling per-mode totals  (exact stats without reading sessions)
// Sessions saved before this split keep their answers inside the main document (`qas`). They still
// display: toSession() hands those answers straight through and no details fetch is needed.

const SAVE_TIMEOUT_MS = 15_000
export const HISTORY_PAGE_SIZE = 10

// App Check is awaited alongside the Firestore chunk, so its token provider exists before the
// first read or write (matters when App Check enforcement is on for Firestore).
async function getFirestoreTools() {
  const [fs] = await Promise.all([import("firebase/firestore"), ensureAppCheck()])
  return { fs, db: fs.getFirestore(app) }
}

const sessionRef = (fs, db, uid, id) => fs.doc(db, "users", uid, "sessions", id)
const detailsRef = (fs, db, uid, id) => fs.doc(db, "users", uid, "sessions", id, "details", "qas")
const statsRef = (fs, db, uid) => fs.doc(db, "users", uid, "stats", "summary")

// ---------- in-memory caches ----------
// All of them live only for the page's lifetime. They are dropped when a session is saved, when the
// user signs out, or when the caller asks for a refresh.
//   cache:       uid -> { sessions, lastDoc, hasMore }   (`lastDoc` is the pagination cursor)
//   statsCache:  uid -> { full, practice } rolling stats
//   detailsCache: "uid:sessionId" -> qas[]
const cache = new Map()
const statsCache = new Map()
const detailsCache = new Map()

const detailsKey = (uid, id) => `${uid}:${id}`

export function getCachedHistory(uid) {
  return cache.get(uid) || null
}

export function getCachedStats(uid) {
  return statsCache.get(uid) || null
}

export function getCachedDetails(uid, id) {
  return detailsCache.get(detailsKey(uid, id)) || null
}

export function clearHistoryCache(uid) {
  if (!uid) {
    cache.clear()
    statsCache.clear()
    detailsCache.clear()
    return
  }
  cache.delete(uid)
  statsCache.delete(uid)
  for (const key of detailsCache.keys()) {
    if (key.startsWith(`${uid}:`)) detailsCache.delete(key)
  }
}

// The id is created up front, so retrying a save overwrites the same document instead of
// creating a duplicate. It doesn't need Firestore: any unique string is a valid document id.
export function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Saving timed out")), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Averages of a stored session document, old or new.
const averagesOf = (data) => data.averages || averageScores(data.qas || [])

// ---------- rolling stats ----------

// Reads the stats document. If it doesn't exist yet and the user already has sessions (saved
// before stats existed), builds it once from their `averages` and stores it.
// Nothing is written for a user with no sessions: the first save creates the document.
async function ensureStats(fs, db, uid) {
  const snap = await fs.getDoc(statsRef(fs, db, uid))
  if (snap.exists()) return normalizeStats(snap.data())

  const all = await fs.getDocs(fs.collection(db, "users", uid, "sessions"))
  const stats = computeStatsFromSessions(
    all.docs.map((d) => ({ mode: d.data().mode, averages: averagesOf(d.data()) }))
  )
  if (all.empty) return stats

  await fs.setDoc(statsRef(fs, db, uid), { ...stats, updatedAt: fs.serverTimestamp() })
  return stats
}

// Exact totals across ALL of the user's sessions: { full: bucket, practice: bucket }.
export async function loadStats(uid, { refresh = false } = {}) {
  if (refresh) statsCache.delete(uid)
  const cached = statsCache.get(uid)
  if (cached) return cached

  const { fs, db } = await getFirestoreTools()
  const stats = await ensureStats(fs, db, uid)
  statsCache.set(uid, stats)
  return stats
}

// ---------- saving ----------

// session: [{ question, answer, inputMethod, metrics, evaluation }]
function toStoredQas(session) {
  // Firestore rejects `undefined`, so every field is given an explicit value.
  return session.map((entry) => ({
    question: entry.question,
    answer: entry.answer,
    inputMethod: entry.inputMethod || "voice",
    isFollowUp: !!entry.isFollowUp,
    metrics: {
      wpm: entry.metrics?.wpm ?? 0,
      fillerCount: entry.metrics?.fillerCount ?? 0,
      responseDelaySec: entry.metrics?.responseDelaySec ?? 0,
    },
    evaluation: {
      contentScore: entry.evaluation.contentScore,
      clarityScore: entry.evaluation.clarityScore,
      confidenceScore: entry.evaluation.confidenceScore,
      feedback: entry.evaluation.feedback || "",
      improvementTip: entry.evaluation.improvementTip || "",
      // The rules want exactly these four booleans or null.
      star: entry.evaluation.star
        ? {
            situation: !!entry.evaluation.star.situation,
            task: !!entry.evaluation.star.task,
            action: !!entry.evaluation.star.action,
            result: !!entry.evaluation.star.result,
          }
        : null,
      strongAnswer: entry.evaluation.strongAnswer || "",
    },
  }))
}

// Writes the summary, the details and the updated stats in ONE transaction, so they can never
// disagree. If the summary already exists, an earlier attempt (one that timed out on our side, say)
// did land: nothing is written again, so retrying can't double-count the session in the stats.
export async function saveSession(uid, sessionId, { role, seniority, mode, overallSummary, session }) {
  const qas = toStoredQas(session)
  const averages = averageScores(session)

  try {
    const { fs, db } = await getFirestoreTools()

    await withTimeout(
      (async () => {
        // Old sessions get folded into the stats first, so the transaction below starts from the truth.
        await ensureStats(fs, db, uid)

        await fs.runTransaction(db, async (tx) => {
          const sRef = sessionRef(fs, db, uid, sessionId)
          const dRef = detailsRef(fs, db, uid, sessionId)
          const stRef = statsRef(fs, db, uid)

          // All reads come before all writes.
          const existing = await tx.get(sRef)
          const statsSnap = await tx.get(stRef)
          if (existing.exists()) return

          const current = statsSnap.exists() ? normalizeStats(statsSnap.data()) : emptyStats()
          const next = addToStats(current, mode, averages)

          tx.set(sRef, {
            role,
            seniority,
            mode,
            overallSummary: overallSummary || "",
            averages,
            answerCount: qas.length,
            createdAt: fs.serverTimestamp(),
          })
          tx.set(dRef, { qas })
          tx.set(stRef, { ...next, updatedAt: fs.serverTimestamp() })
        })
      })(),
      SAVE_TIMEOUT_MS
    )
  } finally {
    // Even a timed-out write may still land later, so nothing cached can be trusted any more.
    clearHistoryCache(uid)
  }
}

// ---------- reading ----------

function toSession(d) {
  const data = d.data()
  // Sessions saved before the split still carry their answers in the main document.
  const legacyQas = Array.isArray(data.qas) ? data.qas : null
  return {
    id: d.id,
    role: data.role,
    seniority: data.seniority,
    mode: data.mode,
    overallSummary: data.overallSummary || "",
    averages: averagesOf(data),
    answerCount: data.answerCount ?? legacyQas?.length ?? 0,
    // null until the details are fetched (see loadSessionDetails). Old sessions have it already.
    session: legacyQas,
    createdAt: data.createdAt?.toDate?.() ?? null,
  }
}

// Loads one page of history, newest first. Only the small summary documents are read.
//   First call (or { refresh: true }): fetches page 1.
//   Later calls: fetch the NEXT page after the cached cursor and append it.
// Always resolves to the full cached entry: { sessions, lastDoc, hasMore }.
export async function loadHistoryPage(uid, { refresh = false } = {}) {
  if (refresh) cache.delete(uid)
  const previous = cache.get(uid) || null

  const { fs, db } = await getFirestoreTools()
  const constraints = [fs.orderBy("createdAt", "desc")]
  if (previous?.lastDoc) constraints.push(fs.startAfter(previous.lastDoc))
  constraints.push(fs.limit(HISTORY_PAGE_SIZE))

  const snap = await fs.getDocs(fs.query(fs.collection(db, "users", uid, "sessions"), ...constraints))

  const entry = {
    sessions: [...(previous?.sessions || []), ...snap.docs.map(toSession)],
    lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : (previous?.lastDoc ?? null),
    hasMore: snap.docs.length === HISTORY_PAGE_SIZE,
  }
  cache.set(uid, entry)
  return entry
}

// The answers, feedback and sample answers of one session (a single document read).
export async function loadSessionDetails(uid, sessionId) {
  const cached = getCachedDetails(uid, sessionId)
  if (cached) return cached

  const { fs, db } = await getFirestoreTools()
  const snap = await fs.getDoc(detailsRef(fs, db, uid, sessionId))
  if (!snap.exists() || !Array.isArray(snap.data().qas)) {
    throw new Error("Session details not found")
  }
  const qas = snap.data().qas
  detailsCache.set(detailsKey(uid, sessionId), qas)
  return qas
}

// ---------- deleting ----------

// Removes the session (summary and details) and takes it out of the rolling stats.
// Resolves to the updated stats, or null if the session no longer existed.
export async function deleteSession(uid, sessionId) {
  const { fs, db } = await getFirestoreTools()
  await ensureStats(fs, db, uid)

  const sRef = sessionRef(fs, db, uid, sessionId)
  const dRef = detailsRef(fs, db, uid, sessionId)
  const stRef = statsRef(fs, db, uid)

  let outcome = null
  await fs.runTransaction(db, async (tx) => {
    outcome = null
    const sSnap = await tx.get(sRef)
    const statsSnap = await tx.get(stRef)

    tx.delete(dRef)
    if (!sSnap.exists()) return
    tx.delete(sRef)

    const data = sSnap.data()
    const current = statsSnap.exists() ? normalizeStats(statsSnap.data()) : emptyStats()
    const { stats, bestStale } = removeFromStats(current, data.mode, averagesOf(data))
    tx.set(stRef, { ...stats, updatedAt: fs.serverTimestamp() })
    outcome = { stats, mode: data.mode, bestStale }
  })

  // Keep the other caches in step, so reopening History doesn't resurrect the deleted session.
  detailsCache.delete(detailsKey(uid, sessionId))
  const entry = cache.get(uid)
  if (entry) {
    cache.set(uid, { ...entry, sessions: entry.sessions.filter((s) => s.id !== sessionId) })
  }

  if (!outcome) return null
  let finalStats = outcome.stats

  // The deleted session may have been the best one. A maximum can't be undone by subtraction, so
  // look it up again. This is rare (only when the best session is deleted), so reading the
  // sessions of that mode is acceptable. If it fails, the stored best stays a little high.
  if (outcome.bestStale) {
    try {
      const snap = await fs.getDocs(
        fs.query(fs.collection(db, "users", uid, "sessions"), fs.where("mode", "==", outcome.mode))
      )
      const best = snap.docs.reduce((max, d) => Math.max(max, averagesOf(d.data()).overall), 0)
      const bucket = { ...finalStats[outcome.mode], best }
      await fs.setDoc(stRef, { [outcome.mode]: bucket, updatedAt: fs.serverTimestamp() }, { merge: true })
      finalStats = { ...finalStats, [outcome.mode]: bucket }
    } catch (err) {
      console.warn("Couldn't refresh the best score after deleting:", err)
    }
  }

  statsCache.set(uid, finalStats)
  return finalStats
}