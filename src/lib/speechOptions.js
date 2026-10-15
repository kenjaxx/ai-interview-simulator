// Speech settings that are no longer user choices. The interviewer's voice comes from the
// interviewer (see interviewers.js and voices.js).

// What the browser's speech recognition listens for. Questions and scoring are in English.
// Chrome also accepts other accents, for example "en-PH", "en-GB" or "en-AU".
export const SPEECH_LANG = "en-US"

// Android reports "en_GB", desktop browsers report "en-GB". Compare them in one form.
export const normLang = (lang = "") => lang.toLowerCase().replace(/_/g, "-")