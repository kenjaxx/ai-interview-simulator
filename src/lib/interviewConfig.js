// Tunable numbers for how an interview runs. Limits shared with the server live in shared/limits.js.

export const QUESTION_COUNT = 6
export const JD_QUESTION_COUNT = 3 // job-description questions added in Full AI Mode

// Follow-ups (Full AI Mode only). Each one costs one AI evaluation.
export const MAX_FOLLOW_UPS = 2 // per interview
export const FOLLOW_UP_EVERY = 2 // considered after the 2nd, 4th, 6th main question, so they're spread out
export const MIN_FOLLOW_UP_WORDS = 15 // shorter answers give the AI nothing to probe
// One for the follow-up itself, one still needed for the final scoring.
export const FOLLOW_UP_MIN_QUOTA = 2
// To enable the toggle: 1 scoring + the maximum number of follow-ups.
export const FOLLOW_UP_SETUP_QUOTA = 1 + MAX_FOLLOW_UPS

export const MODE_STORAGE_KEY = "interview-ai-mode"
