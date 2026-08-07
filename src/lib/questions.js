// A fixed local question bank — no API call needed to pick a question.
// Mostly role-agnostic behavioral/technical questions plus a few
// role-flavored ones. Not adaptive (won't follow up on what you actually
// said), but costs zero API requests.

const GENERAL_QUESTIONS = [
  "Tell me about a recent project you're proud of and what made it challenging.",
  "Describe a time you disagreed with a teammate on a technical decision. How did you handle it?",
  "How do you approach debugging a tricky, hard-to-reproduce issue?",
  "Walk me through how you prioritize tasks when everything feels urgent.",
  "Tell me about a time you had to learn something new quickly to finish a project.",
  "Describe a mistake you made at work and what you did about it.",
  "How do you handle feedback or code review comments you disagree with?",
  "Tell me about a time you had to work with an unclear or changing set of requirements.",
]

const ROLE_QUESTIONS = {
  "Frontend Developer": [
    "How do you approach making a UI accessible and performant at the same time?",
    "Tell me about a time you had to optimize a slow-rendering page or component.",
    "How do you decide between client-side and server-side rendering for a feature?",
  ],
  "Backend Developer": [
    "How do you approach designing an API that other teams will depend on?",
    "Tell me about a time you had to debug a production performance issue.",
    "How do you think about data consistency when multiple services touch the same data?",
  ],
  "Full-Stack Developer": [
    "How do you decide where a piece of logic should live — frontend, backend, or both?",
    "Tell me about a full feature you built end-to-end. What was the trickiest part?",
  ],
  "Mobile Developer": [
    "How do you approach handling poor or intermittent network conditions in an app?",
    "Tell me about a time you had to optimize battery or memory usage.",
  ],
  "DevOps Engineer": [
    "Walk me through how you'd respond to a production outage at 2am.",
    "How do you approach balancing deployment speed with system stability?",
  ],
  "Data Analyst / Data Scientist": [
    "Tell me about a time your analysis changed a decision someone was about to make.",
    "How do you sanity-check a result that looks surprisingly good?",
  ],
  "QA / Test Engineer": [
    "How do you decide what to automate versus test manually?",
    "Tell me about a bug that was especially hard to track down.",
  ],
  "Tech Support / IT Support": [
    "Tell me about a time you had to explain a technical issue to a frustrated, non-technical user.",
    "How do you triage when you have multiple urgent tickets at once?",
  ],
  "Product Manager": [
    "Tell me about a time you had to say no to a feature request. How did you handle it?",
    "How do you decide what to prioritize when engineering time is limited?",
  ],
  "UI/UX Designer": [
    "Tell me about a time user feedback completely changed your design direction.",
    "How do you balance what users ask for with what they actually need?",
  ],
}

// Fisher-Yates shuffle, doesn't mutate the input array.
function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Builds a `count`-length list of questions for the given role, mixing in
// a couple of role-flavored ones where available, deduplicated, no API call.
export function pickQuestions(role, count) {
  const roleSpecific = ROLE_QUESTIONS[role] || []
  const pool = shuffle([...roleSpecific, ...GENERAL_QUESTIONS])

  // Prefer putting 1-2 role-specific questions in the mix, rest general —
  // simplest way to do that without extra bookkeeping: pool is already
  // role-specific-first before shuffle bias... so just dedupe and slice.
  const seen = new Set()
  const result = []
  for (const q of pool) {
    if (seen.has(q)) continue
    seen.add(q)
    result.push(q)
    if (result.length >= count) break
  }

  // If the role+general pool somehow came up short, pad with generals
  // (shouldn't normally happen given the bank sizes above).
  if (result.length < count) {
    for (const q of shuffle(GENERAL_QUESTIONS)) {
      if (result.length >= count) break
      if (!seen.has(q)) { seen.add(q); result.push(q) }
    }
  }

  return result
}