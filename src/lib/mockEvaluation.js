// Local, no-AI scoring used by Practice Mode and VITE_MOCK_AI.

export function mockDelay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Heuristic, metrics-based evaluation for a single Q&A, with no real AI judgment.
export function mockEvaluation(answer = "", metrics = {}, inputMethod = "voice") {
  const typed = inputMethod === "text"
  const { fillerCount = 0, wpm = 0, responseDelaySec = 0 } = metrics
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0

  let confidenceScore = 90
  confidenceScore -= fillerCount * 4
  if (!typed) {
    confidenceScore -= Math.max(0, responseDelaySec - 3) * 2
    if (wpm > 0 && (wpm < 90 || wpm > 190)) confidenceScore -= 10
  }
  confidenceScore = clamp(Math.round(confidenceScore), 30, 98)

  let clarityScore = 88
  if (!typed && wpm > 0) {
    const distanceFromIdeal = Math.abs(wpm - 140)
    clarityScore -= Math.round(distanceFromIdeal / 5)
  }
  clarityScore -= Math.floor(fillerCount / 2)
  clarityScore = clamp(clarityScore, 30, 97)

  let contentScore = 60
  if (wordCount >= 25) contentScore = 78
  if (wordCount >= 60) contentScore = 88
  if (wordCount < 10) contentScore = 45
  contentScore = clamp(contentScore, 20, 95)

  const scores = { content: contentScore, clarity: clarityScore, confidence: confidenceScore }
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]

  const feedbackByArea = {
    content: `(Mock feedback) You gave a ${wordCount}-word answer — a bit more detail or a concrete example would strengthen it.`,
    clarity: typed
      ? "(Mock feedback) Shorter, more direct sentences would make your typed answer easier to follow."
      : `(Mock feedback) Your pace was around ${wpm || "an unmeasured"} wpm — aim for a steady, conversational rhythm to sound clearer.`,
    confidence:
      fillerCount > 0
        ? `(Mock feedback) You used ${fillerCount} filler word${fillerCount === 1 ? "" : "s"} (um/uh/like/kind of) — cutting those down will sound more confident.`
        : typed
          ? "(Mock feedback) Your typed answer reads steadily — avoid hedging phrases to sound even more decisive."
          : `(Mock feedback) Watch your response delay (${responseDelaySec}s before you started) — jumping in sooner reads as more confident.`,
  }

  const tipByArea = {
    content: "(Mock tip) Structure your answer with a brief example: situation, action, result.",
    clarity: typed
      ? "(Mock tip) Lead with the outcome, then give the context."
      : "(Mock tip) Practice saying your answer at a steady pace — not rushed, not dragging.",
    confidence: "(Mock tip) Pause silently instead of using filler words when you need a moment to think.",
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
