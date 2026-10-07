import { app } from "./firebase"
import { averageScores } from "./scores"

// "firebase/firestore" is loaded on first use, so it stays out of the main bundle.
// Vite turns the dynamic import() below into its own chunk.

const SAVE_TIMEOUT_MS = 10_000
export const HISTORY_PAGE_SIZE = 10

async function getFirestoreTools() {
  const fs = await import("firebase/firestore")
  return { fs, db: fs.getFirestore(app) }
}

// ---------- in-memory cache ----------
// uid -> { sessions, lastDoc, hasMore }
// `lastDoc` is the Firestore snapshot of the last loaded session, used as the pagination cursor.
// The cache lives only for the page's lifetime. It is dropped when a new session is saved, when the
// user signs out, or when the caller asks for a refresh.
const cache = new Map()

export function getCachedHistory(uid) {
  return cache.get(uid) || null
}

export function clearHistoryCache(uid) {
  if (uid) cache.delete(uid)
  else cache.clear()
}

// The id is created up front, so retrying a save overwrites the same document instead of
// creating a duplicate (Firestore queues writes offline, so a timed-out save may still land later).
// It doesn't need Firestore: any unique string is a valid document id.
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

// session: [{ question, answer, inputMethod, metrics, evaluation }]
export async function saveSession(uid, sessionId, { role, seniority, mode, overallSummary, session }) {
  // Firestore rejects `undefined`, so every field is given an explicit value.
  const qas = session.map((entry) => ({
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
      // Firestore rejects `undefined`, and the rules want exactly these four booleans or null.
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

  try {
    const { fs, db } = await getFirestoreTools()
    await withTimeout(
      fs.setDoc(fs.doc(db, "users", uid, "sessions", sessionId), {
        role,
        seniority,
        mode,
        overallSummary: overallSummary || "",
        averages: averageScores(session),
        qas,
        createdAt: fs.serverTimestamp(),
      }),
      SAVE_TIMEOUT_MS
    )
  } finally {
    // Even a timed-out write may still land later, so the cached list can't be trusted any more.
    cache.delete(uid)
  }
}

function toSession(d) {
  const data = d.data()
  const session = data.qas || []
  return {
    id: d.id,
    role: data.role,
    seniority: data.seniority,
    mode: data.mode,
    overallSummary: data.overallSummary || "",
    averages: data.averages || averageScores(session),
    session,
    createdAt: data.createdAt?.toDate?.() ?? null,
  }
}

// Loads one page of history, newest first.
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
    lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : previous?.lastDoc ?? null,
    hasMore: snap.docs.length === HISTORY_PAGE_SIZE,
  }
  cache.set(uid, entry)
  return entry
}

export async function deleteSession(uid, sessionId) {
  const { fs, db } = await getFirestoreTools()
  await fs.deleteDoc(fs.doc(db, "users", uid, "sessions", sessionId))

  // Keep the cache in step so reopening History doesn't resurrect the deleted session.
  const entry = cache.get(uid)
  if (entry) {
    cache.set(uid, { ...entry, sessions: entry.sessions.filter((s) => s.id !== sessionId) })
  }
}