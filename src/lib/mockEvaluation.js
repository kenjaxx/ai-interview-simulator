// Local, no-AI scoring used by Practice Mode and VITE_MOCK_AI.
// It can't judge truth or quality like a model, but it does check that the text is real language,
// answers the question, and has some depth, so nonsense can no longer score well.

export function mockDelay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const COMMON = new Set(
  `a an the and or but if so as of to in on at by for with from into about over after before than then
  that this these those it its is are was were be been being am i me my we our you your he she they them
  their not no yes do did does done have has had can could will would should may might just also very more
  most some any all each many much one two what which who when where why how there here up out off down
  i'm i'd i've i'll it's don't didn't can't won't isn't wasn't ok hi go ui ux qa ci cd ai ml db vm pr it
  css sql jwt html http https tcp udp dns cdn cli npm php xml json yml ssh ssl tls vpn sdk orm mvc ssr csr
  aws gcp api rest grpc`.split(/\s+/)
)

// Words in a question that say nothing about the topic.
const GENERIC = new Set(
  "tell describe explain walk through time about approach handle give example situation kind thing things would".split(
    " "
  )
)

const KEYBOARD = /qwer|wert|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|uiop|yuio|tyui|rtyu/
const OUTCOME =
  /\b(result|outcome|improved|reduced|increased|decreased|saved|delivered|launched|shipped|fixed|achieved|resolved|cut|grew)\b/
const ACTION =
  /\bi (built|led|wrote|designed|implemented|created|fixed|decided|ran|owned|worked|made|developed|managed|tested|analy[sz]ed|set up|introduced|proposed)\b/
const REASON = /\b(because|so that|therefore|trade-?off|instead|however|as a result|which meant)\b/
const FLOW = /\b(first|firstly|then|after that|afterwards|next|finally|in the end|initially)\b/g
const HEDGE =
  /\b(maybe|perhaps|probably|i guess|i think|not sure|sort of|kind of|kinda|sorta|i suppose|hopefully)\b/g
const DONT_KNOW = /\bi\s*(do\s*not|don'?t)\s*know\b|\bidk\b|\bno idea\b/

// Does this token look like a real word? Catches keyboard mashing, vowel-less strings, repeated chunks.
// Does this token look like a real word? Catches keyboard mashing, vowel-less strings, repeated chunks.
function looksLikeWord(w) {
  if (COMMON.has(w)) return true
  if (/[^\p{ASCII}]/u.test(w)) return true // other scripts: don't judge
  if (w.length < 3 || w.length > 24) return false
  if (!/[aeiouy]/.test(w)) return false
  if (/[^aeiouy']{6,}/.test(w)) return false
  if (KEYBOARD.test(w)) return false
  if (/q(?!u)/.test(w)) return false
  if (/(.)\1{3,}/.test(w)) return false
  if (w.length >= 6 && /(.{3,4})\1/.test(w)) return false
  return true
}

const stem = (w) => w.replace(/(ing|ed|es|s)$/, "")

function analyze(answer, question) {
  const words = (String(answer).toLowerCase().match(/[\p{L}][\p{L}']*/gu) || [])
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
  const n = words.length
  if (n === 0) return { n: 0, quality: 0, uniqueRatio: 0, contentWords: new Set(), hits: 0, qCount: 0 }

  const plausible = words.filter(looksLikeWord)
  const plausibleRatio = plausible.length / n
  const commonRatio = words.filter((w) => COMMON.has(w)).length / n
  const uniqueRatio = new Set(words).size / n

  // 0 to 1: how much this reads like a real answer.
  let quality = plausibleRatio ** 2
  if (n >= 5) quality *= Math.min(1, commonRatio / 0.2) // real sentences have glue words
  if (n >= 4) quality *= Math.min(1, uniqueRatio / 0.6) // "test test test test" isn't an answer

  const contentWords = new Set(plausible.filter((w) => w.length >= 3 && !COMMON.has(w)))
  const answerStems = new Set([...contentWords].map(stem))
  const qWords = [
    ...new Set(
      (String(question).toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !COMMON.has(w) && !GENERIC.has(w))
    ),
  ].map(stem)
  const hits = qWords.filter((q) => answerStems.has(q)).length

  return { n, quality, uniqueRatio, contentWords, hits, qCount: qWords.length }
}

// Below this, the text isn't treated as an answer at all.
const NONSENSE_BELOW = 0.5

export function mockEvaluation(answer = "", metrics = {}, inputMethod = "voice", question = "") {
  const typed = inputMethod === "text"
  const { fillerCount = 0, wpm = 0, responseDelaySec = 0 } = metrics
  const a = analyze(answer, question)

  // Nonsense (random keys, repeated words, empty): every score stays under 10.
  if (a.quality < NONSENSE_BELOW) {
    return {
      contentScore: Math.floor(a.quality * 16),
      clarityScore: Math.floor(a.quality * 18),
      confidenceScore: Math.floor(a.quality * 18),
      feedback:
        "(Mock feedback) This didn't read as a real answer. It looks like random characters or repeated words, so it was scored near zero.",
      improvementTip: "(Mock tip) Answer in full sentences: what happened, what you did, and how it ended.",
      star: null,
      strongAnswer: "",
    }
  }

  const lower = String(answer).toLowerCase()
  const sentences = String(answer)
    .split(/[.!?\n]+/)
    .filter((s) => s.trim().split(/\s+/).filter(Boolean).length >= 3).length
  const flowHits = (lower.match(FLOW) || []).length

  // Voice transcripts usually have no punctuation, so they're judged on length instead of sentences.
  const sentencePts = typed ? (sentences >= 3 ? 14 : sentences >= 2 ? 8 : 0) : a.n >= 40 ? 14 : a.n >= 20 ? 8 : 0
  const structurePts = Math.min(20, sentencePts + Math.min(6, flowHits * 3))

  // ---- content: depth, relevance, specifics, structure (max 100) ----
  const lengthPts = Math.min(40, a.contentWords.size * 1.6)
  const relevancePts = a.qCount ? 15 * Math.min(1, a.hits / Math.min(3, a.qCount)) : 8
  const specificityPts =
    (/\d/.test(answer) ? 8 : 0) +
    (OUTCOME.test(lower) ? 6 : 0) +
    (ACTION.test(lower) ? 6 : 0) +
    (REASON.test(lower) ? 5 : 0)
  const factor = 0.5 + 0.5 * a.quality // partly garbled answers lose points everywhere
  const contentScore = clamp(Math.round((lengthPts + relevancePts + specificityPts + structurePts) * factor), 5, 97)

  // ---- clarity: enough said, organised, not repetitive, few fillers, steady pace ----
  const fillerRate = 1 - Math.min(1, fillerCount / Math.max(3, a.n / 12))
  let clarity =
    30 +
    25 * Math.min(1, a.n / 40) +
    20 * (structurePts / 20) +
    15 * Math.min(1, a.uniqueRatio / 0.6) +
    10 * fillerRate
  if (!typed && wpm > 0) clarity -= Math.min(20, Math.round(Math.abs(wpm - 140) / 4))
  const clarityScore = clamp(Math.round(clarity * factor), 5, 97)

  // ---- confidence: decisive wording, few fillers, quick start, enough said ----
  const hedges = (lower.match(HEDGE) || []).length
  let confidence = 88 - Math.min(25, hedges * 6) - Math.min(30, fillerCount * 4)
  if (DONT_KNOW.test(lower)) confidence -= 25
  if (!typed) {
    confidence -= Math.min(20, Math.max(0, responseDelaySec - 3) * 2)
    if (wpm > 0 && (wpm < 90 || wpm > 190)) confidence -= 10
  }
  confidence *= 0.5 + 0.5 * Math.min(1, a.n / 25) // a one-liner can't sound very confident
  const confidenceScore = clamp(Math.round(confidence * factor), 5, 97)

  const scores = { content: contentScore, clarity: clarityScore, confidence: confidenceScore }
  const weakest = Object.entries(scores).sort((x, y) => x[1] - y[1])[0][0]

  const feedbackByArea = {
    content:
      a.qCount && a.hits === 0
        ? "(Mock feedback) Your answer never picked up the key terms of the question. Speak to what was actually asked, with a concrete example."
        : `(Mock feedback) You gave ${a.n} words, but the answer is light on specifics. Add a concrete example, a number, or the outcome.`,
    clarity: typed
      ? "(Mock feedback) Shorter, more direct sentences with a clear order (first, then, finally) would make this easier to follow."
      : `(Mock feedback) Your pace was around ${wpm || "an unmeasured"} wpm and the answer lacked a clear order. Aim for a steady rhythm and walk through it step by step.`,
    confidence:
      fillerCount > 0 || hedges > 0
        ? `(Mock feedback) ${fillerCount} filler word${fillerCount === 1 ? "" : "s"} and ${hedges} hedge${hedges === 1 ? "" : "s"} (maybe, I think, kind of) weaken the delivery. State things directly.`
        : typed
          ? "(Mock feedback) Your wording is decisive, but the answer is short. A fuller answer sounds more confident."
          : `(Mock feedback) You started after ${responseDelaySec}s. Jumping in sooner reads as more confident.`,
  }

  const tipByArea = {
    content: "(Mock tip) Structure it as situation, action, result, and include one number if you can.",
    clarity: typed
      ? "(Mock tip) Lead with the outcome, then give the context."
      : "(Mock tip) Practice at a steady pace, not rushed and not dragging.",
    confidence: '(Mock tip) Pause silently instead of using fillers, and replace "I think maybe" with a direct statement.',
  }

  return {
    contentScore,
    clarityScore,
    confidenceScore,
    feedback: feedbackByArea[weakest],
    improvementTip: tipByArea[weakest],
    // STAR analysis and sample answers need real AI, so Practice Mode leaves them empty.
    star: null,
    strongAnswer: "",
  }
}

// A session summary built from the actual scores, instead of one fixed sentence.
export function mockSummary(evaluations) {
  if (!evaluations.length) return ""
  const avg = (k) => Math.round(evaluations.reduce((s, e) => s + e[k], 0) / evaluations.length)
  const areas = { Content: avg("contentScore"), Clarity: avg("clarityScore"), Confidence: avg("confidenceScore") }
  const overall = Math.round((areas.Content + areas.Clarity + areas.Confidence) / 3)
  const [weakName, weakScore] = Object.entries(areas).sort((x, y) => x[1] - y[1])[0]
  const nonsense = evaluations.filter((e) => e.contentScore < 10 && e.clarityScore < 10).length

  const opener =
    overall >= 80
      ? "Strong session."
      : overall >= 65
        ? "Decent session with clear room to grow."
        : overall >= 40
          ? "This session needs more work."
          : "These answers were too thin or unclear to score well."
  const tips = {
    Content: "Add concrete examples, numbers and outcomes.",
    Clarity: "Organise answers in order and keep a steady pace.",
    Confidence: "Cut fillers and hedging, and start answering sooner.",
  }
  const parts = [opener, `Your weakest area was ${weakName} (${weakScore}). ${tips[weakName]}`]
  if (nonsense > 0) {
    parts.push(`${nonsense} of ${evaluations.length} answers didn't read as real answers and scored near zero.`)
  }
  parts.push("(Practice Mode: scored locally, not real AI feedback.)")
  return parts.join(" ")
}