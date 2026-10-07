// Questions and scoring are in English, so these are English accents for speech recognition.
export const ACCENTS = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-IE", label: "English (Ireland)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-NZ", label: "English (New Zealand)" },
  { code: "en-PH", label: "English (Philippines)" },
  { code: "en-SG", label: "English (Singapore)" },
  { code: "en-ZA", label: "English (South Africa)" },
]

export const DEFAULT_LANG = "en-US"
export const isValidLang = (code) => ACCENTS.some((a) => a.code === code)

export const RATE_MIN = 0.7
export const RATE_MAX = 1.5
export const RATE_STEP = 0.1
export const DEFAULT_RATE = 1

export const PREVIEW_TEXT =
  "Hello, I'll be your interviewer today. Tell me about a project you're proud of."

// Android reports "en_GB", desktop browsers report "en-GB". Compare them in one form.
export const normLang = (lang = "") => lang.toLowerCase().replace(/_/g, "-")

// Installed voices that match an accent exactly. Local voices come first because they work
// offline and (unlike many network voices) report word timing, which the orb relies on.
export function voicesForAccent(voices, code) {
  const wanted = normLang(code)
  return voices
    .filter((v) => normLang(v.lang) === wanted)
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name))
}

export function bestVoiceForAccent(voices, code) {
  return voicesForAccent(voices, code)[0] || null
}