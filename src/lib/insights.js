import { averageScores, entryOverall, isWeak } from "./scores"

// Turns a finished session into short "strengths" and "work on next" lists for the summary screen.
// Pure logic, so it works for Practice Mode and Full AI Mode alike: it only reads scores, metrics,
// STAR checks and the answer text.
//
//   session  [{ question, answer, inputMethod, metrics, evaluation }]
// Returns { strengths: Item[], focus: Item[] } where Item = { id, title, detail }.

const MAX_ITEMS = 3
const HEDGE = /\b(maybe|perhaps|probably|i guess|i think|not sure|sort of|kind of|kinda|sorta|i suppose|hopefully)\b/gi

const STAR_PARTS = [
  { key: "situation", label: "Situation", fix: "Open with the context so the story makes sense." },
  { key: "task", label: "Task", fix: "Say what you were responsible for." },
  { key: "action", label: "Action", fix: "Spell out what you personally did." },
  { key: "result", label: "Result", fix: "Close with what changed because of you." },
]

const wordCount = (text) => {
  const t = String(text ?? "").trim()
  return t ? t.split(/\s+/).length : 0
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
const shorten = (text, max = 60) => {
  const t = String(text ?? "").trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export function computeInsights(session) {
  const entries = Array.isArray(session) ? session : []
  if (entries.length === 0) return { strengths: [], focus: [] }

  const avg = averageScores(entries)
  const total = entries.length

  // Answers that were not real answers (random keys, empty): they must not feed any "strength".
  const isNonsense = (e) => e.evaluation.contentScore < 10
  const nonsense = entries.filter(isNonsense).length
  const real = entries.filter((e) => !isNonsense(e))

  const words = entries.reduce((sum, e) => sum + wordCount(e.answer), 0)
  const fillers = entries.reduce((sum, e) => sum + (e.metrics?.fillerCount ?? 0), 0)
  const fillersPer100 = words ? (fillers / words) * 100 : 0

  const voice = real.filter((e) => e.inputMethod !== "text")
  const paced = voice.filter((e) => (e.metrics?.wpm ?? 0) > 0)
  const avgWpm = paced.length ? Math.round(mean(paced.map((e) => e.metrics.wpm))) : 0
  const avgDelay = voice.length ? Math.round(mean(voice.map((e) => e.metrics?.responseDelaySec ?? 0)) * 10) / 10 : null

  const behavioral = real.filter((e) => e.evaluation.star)
  const withNumbers = real.filter((e) => /\d/.test(e.answer ?? "")).length
  const hedges = real.reduce((sum, e) => sum + ((e.answer ?? "").match(HEDGE) || []).length, 0)
  const shortAnswers = real.filter((e) => wordCount(e.answer) < 20).length

  const scored = entries.map((e, i) => ({ i, score: entryOverall(e) }))
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a))

  // ---------- strengths (only when there is something real to praise) ----------
  const strengths = []
  const good = (id, rank, title, detail) => strengths.push({ id, rank, title, detail })

  if (real.length > 0) {
    if (avg.confidence >= 75) good("confidence", avg.confidence, "Confident delivery", `Confidence averaged ${avg.confidence}.`)
    if (avg.clarity >= 75) good("clarity", avg.clarity, "Clear and easy to follow", `Clarity averaged ${avg.clarity}.`)
    if (avg.content >= 75) good("content", avg.content, "Relevant, specific answers", `Content averaged ${avg.content}.`)
    if (avgWpm >= 110 && avgWpm <= 170) good("pace", 72, "Steady pace", `${avgWpm} words per minute is easy to follow.`)
    if (words >= 30 && fillersPer100 <= 2) {
      good("fillers", 74, "Very few filler words", `${plural(fillers, "filler")} in ${words} words.`)
    }
    if (avgDelay !== null && avgDelay <= 2.5) {
      good("delay", 70, "Quick to start", `You began answering after about ${avgDelay}s.`)
    }
    if (behavioral.length > 0) {
      const complete = behavioral.filter((e) => STAR_PARTS.every((p) => e.evaluation.star[p.key])).length
      const withResult = behavioral.filter((e) => e.evaluation.star.result).length
      if (complete === behavioral.length) {
        good("star", 88, "Complete STAR stories", "Every behavioral answer covered all four parts.")
      } else if (withResult === behavioral.length) {
        good("result", 76, "You state the outcome", "Every behavioral answer ended with a result.")
      }
    }
    if (real.length >= 2 && withNumbers >= real.length / 2) {
      good("numbers", 71, "Backs claims with numbers", `${plural(withNumbers, "answer")} included figures.`)
    }
    if (strengths.length === 0 && best.score >= 60) {
      good("best", best.score, `Best answer: Answer ${best.i + 1}`, `Scored ${best.score}: “${shorten(entries[best.i].question)}”`)
    }
  }

  // ---------- focus areas, most urgent first ----------
  const focus = []
  const need = (id, rank, title, detail) => focus.push({ id, rank, title, detail })

  if (nonsense > 0) {
    need(
      "nonsense",
      120,
      `${plural(nonsense, "answer")} didn't read as real`,
      "Answer in full sentences: what happened, what you did, and how it ended."
    )
  }
  if (real.length > 0) {
    if (avg.content < 60) {
      need("content", 110 - avg.content, "Add specifics", `Content averaged ${avg.content}. Give an example, a number, and the outcome.`)
    }
    if (avg.clarity < 60) {
      need("clarity", 105 - avg.clarity, "Organise your answers", `Clarity averaged ${avg.clarity}. Walk through it in order: first, then, finally.`)
    }
    if (avg.confidence < 60) {
      need("confidence", 105 - avg.confidence, "Sound more decisive", `Confidence averaged ${avg.confidence}. Drop hedges and start sooner.`)
    }
    if (shortAnswers > 0) {
      need("short", 70, `${plural(shortAnswers, "answer")} too short`, "Aim for 40+ words, about 20 to 30 seconds out loud.")
    }
    if (fillers >= 3 && fillersPer100 > 4) {
      need("fillers", 60 + fillersPer100, "Cut filler words", `${plural(fillers, "filler")} in ${words} words. Pause silently instead.`)
    }
    if (avgWpm > 0 && (avgWpm < 100 || avgWpm > 170)) {
      need("pace", 65, `Pace is too ${avgWpm < 100 ? "slow" : "fast"}`, `${avgWpm} words per minute. Aim for 120 to 160.`)
    }
    if (avgDelay !== null && avgDelay > 4) {
      need("delay", 55, "Start answering sooner", `You took about ${avgDelay}s to begin.`)
    }
    if (behavioral.length > 0) {
      const gaps = STAR_PARTS.map((p) => ({
        ...p,
        missing: behavioral.filter((e) => !e.evaluation.star[p.key]).length,
      })).sort((a, b) => b.missing - a.missing)
      const top = gaps[0]
      if (top.missing > 0) {
        need("star", 85, `Missing the ${top.label} in ${top.missing} of ${behavioral.length}`, top.fix)
      }
    }
    if (hedges >= 3) {
      need("hedges", 50, "Reduce hedging", `${plural(hedges, "hedge")} like “maybe” and “I think” softened your answers.`)
    }
    if (total > 1 && isWeak(entries[worst.i])) {
      need("weakest", 45, `Retry Answer ${worst.i + 1}`, `Your lowest score (${worst.score}): “${shorten(entries[worst.i].question)}”`)
    }
  }
  if (focus.length === 0) {
    need("vary", 0, "Keep stretching", "Try a different role or question type to stress-test your answers.")
  }

  const top = (list) =>
    list
      .sort((a, b) => b.rank - a.rank)
      .slice(0, MAX_ITEMS)
      .map(({ id, title, detail }) => ({ id, title, detail }))

  return { strengths: top(strengths), focus: top(focus) }
}