// Limits used by BOTH the browser and the serverless function.
// Imported by the server directly and by the app through src/lib/limits.js, so they can't drift apart.
//
// firestore.rules can't import code. If you change a number marked [rules], update firestore.rules too.

// Job-description question generation
export const MIN_JD_CHARS = 40
export const MAX_JD_CHARS = 4000
export const MAX_GENERATED_QUESTIONS = 5
export const MAX_GENERATED_QUESTION_CHARS = 300

// Follow-up question generation
export const MAX_FOLLOWUP_CHARS = 300
export const MIN_FOLLOWUP_ANSWER_CHARS = 20

// Evaluation input
export const MAX_QAS = 10 // [rules]
export const MAX_QUESTION_CHARS = 500 // [rules]
export const MAX_ANSWER_CHARS = 4000 // [rules]
export const MAX_TOTAL_CHARS = 20000 // across all questions + answers, caps the tokens one request can cost

// Evaluation output
export const MAX_FEEDBACK_CHARS = 1000 // [rules]
export const MAX_TIP_CHARS = 500 // [rules]
export const MAX_STRONG_ANSWER_CHARS = 1500 // [rules]
export const MAX_SUMMARY_CHARS = 1000 // [rules]
