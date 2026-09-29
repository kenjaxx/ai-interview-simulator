import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore"
import { db } from "./firebase"
import { averageScores } from "./scores"

const SAVE_TIMEOUT_MS = 10_000

const sessionsCol = (uid) => collection(db, "users", uid, "sessions")

// The id is created up front, so retrying a save overwrites the same document instead of
// creating a duplicate (Firestore queues writes offline, so a timed-out save may still land later).
export function newSessionId(uid) {
  return doc(sessionsCol(uid)).id
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
    },
  }))

  await withTimeout(
    setDoc(doc(db, "users", uid, "sessions", sessionId), {
      role,
      seniority,
      mode,
      overallSummary: overallSummary || "",
      averages: averageScores(session),
      qas,
      createdAt: serverTimestamp(),
    }),
    SAVE_TIMEOUT_MS
  )
}

export async function loadHistory(uid, max = 50) {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(max)))
  return snap.docs.map((d) => {
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
  })
}

export async function deleteSession(uid, sessionId) {
  await deleteDoc(doc(db, "users", uid, "sessions", sessionId))
}