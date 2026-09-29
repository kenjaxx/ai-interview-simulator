// A fixed local question bank, so picking questions costs no API call.
// Each session guarantees a few role-specific and seniority-specific questions, then fills the
// rest with general ones.

const ROLE_QUOTA = 2 // role-specific questions guaranteed per session (when the role has them)
const LEVEL_QUOTA = 1 // seniority-specific questions guaranteed per session

const GENERAL_QUESTIONS = [
  "Tell me about a recent project you're proud of and what made it challenging.",
  "Describe a time you disagreed with a teammate on a decision. How did you handle it?",
  "How do you approach debugging a tricky, hard-to-reproduce issue?",
  "Walk me through how you prioritize tasks when everything feels urgent.",
  "Tell me about a time you had to learn something new quickly to finish a project.",
  "Describe a mistake you made at work and what you did about it.",
  "How do you handle feedback or review comments you disagree with?",
  "Tell me about a time you had to work with an unclear or changing set of requirements.",
]

const SENIORITY_QUESTIONS = {
  "Entry-level": [
    "Tell me about something you built or learned recently, on your own or in school, that you're proud of.",
    "How do you decide when you've been stuck long enough to ask for help?",
    "Tell me about a time you got critical feedback early in your career. What did you change?",
    "What kind of environment and mentorship helps you grow the fastest?",
  ],
  "Mid-level": [
    "Tell me about a time you owned a project from a vague idea all the way to delivery.",
    "Describe a time you had to push back on a deadline or scope. What was the outcome?",
    "How do you decide between polishing something and shipping it?",
    "Tell me about a time you helped a more junior teammate get unstuck.",
  ],
  Senior: [
    "Tell me about a decision you made that affected multiple teams. How did you build buy-in?",
    "Describe a time you had to make a high-risk call with incomplete information.",
    "How do you mentor others and raise the bar for the team without becoming a bottleneck?",
    "Tell me about a project that failed or was cancelled. What did you learn, and what changed afterwards?",
  ],
}

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

// Builds a `count`-length list: ROLE_QUOTA role-specific + LEVEL_QUOTA seniority-specific questions
// are always included (when the bank has them), general questions fill the rest, and anything
// still missing is padded from the leftover role/seniority questions. The final order is shuffled.
export function pickQuestions(role, seniority, count) {
  const roleQs = shuffle(ROLE_QUESTIONS[role] || [])
  const levelQs = shuffle(SENIORITY_QUESTIONS[seniority] || [])
  const general = shuffle(GENERAL_QUESTIONS)

  const picked = []
  const seen = new Set()
  const add = (q) => {
    if (!q || seen.has(q) || picked.length >= count) return
    seen.add(q)
    picked.push(q)
  }

  roleQs.slice(0, ROLE_QUOTA).forEach(add)
  levelQs.slice(0, LEVEL_QUOTA).forEach(add)
  general.forEach(add)
  ;[...roleQs, ...levelQs].forEach(add)

  return shuffle(picked)
}