// Shared data shapes, written as JSDoc so editors can autocomplete them without TypeScript.
// Usage in any file:  /** @param {import("./types").SessionEntry} entry */

/**
 * @typedef {Object} Metrics
 * @property {number} wpm              Words per minute (0 for typed answers).
 * @property {number} fillerCount      Weighted filler-word count.
 * @property {number} responseDelaySec Seconds before the candidate started (0 for typed answers).
 */

/**
 * @typedef {Object} StarCheck
 * @property {boolean} situation
 * @property {boolean} task
 * @property {boolean} action
 * @property {boolean} result
 */

/**
 * @typedef {Object} Evaluation
 * @property {number} contentScore     0-100
 * @property {number} clarityScore     0-100
 * @property {number} confidenceScore  0-100
 * @property {string} feedback
 * @property {string} improvementTip
 * @property {StarCheck|null} star     null for non-behavioral questions
 * @property {string} strongAnswer     "" in Practice Mode
 */

/**
 * @typedef {Object} SessionEntry
 * @property {string} question
 * @property {string} answer
 * @property {"voice"|"text"} inputMethod
 * @property {boolean} isFollowUp
 * @property {Metrics} metrics
 * @property {Evaluation} evaluation
 */

/**
 * @typedef {Object} Quota
 * @property {number} remaining
 * @property {number} limit
 * @property {boolean} globalExhausted
 */

/**
 * A session as listed in History. Only the summary is loaded up front.
 * @typedef {Object} SavedSession
 * @property {string} id
 * @property {string} role
 * @property {string} seniority
 * @property {"practice"|"full"} mode
 * @property {string} overallSummary
 * @property {{content:number, clarity:number, confidence:number, overall:number}} averages
 * @property {number} answerCount
 * @property {SessionEntry[]|null} session  null until the details are loaded (sessions saved
 *                                          before the split already have it)
 * @property {Date|null} createdAt
 */

/**
 * Running totals for one mode, stored in users/{uid}/stats/summary.
 * content / clarity / confidence / overall are SUMS of the sessions' averages.
 * @typedef {Object} StatsBucket
 * @property {number} count
 * @property {number} content
 * @property {number} clarity
 * @property {number} confidence
 * @property {number} overall
 * @property {number} best     highest overall score
 */

/**
 * @typedef {Object} HistoryStats
 * @property {StatsBucket} full
 * @property {StatsBucket} practice
 */

export {}