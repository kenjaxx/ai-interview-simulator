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