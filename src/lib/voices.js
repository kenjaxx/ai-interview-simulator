import { normLang } from "./speechOptions"

// Works out which installed text-to-speech voice an interviewer should use.
//
// Each interviewer lists the exact voices it wants (see interviewers.js). Which voices exist depends
// on the browser and operating system (Google voices only exist in Chrome, Microsoft voices on
// Windows), so there is always a fallback: a voice of the same gender and language, then any English
// voice, then the browser's own default (voice: null).

const FEMALE_NAMES = [
  "zira", "hazel", "susan", "samantha", "victoria", "karen", "moira", "tessa", "fiona", "kate",
  "serena", "martha", "libby", "sonia", "jenny", "aria", "emma", "amy", "heather", "linda",
  "catherine", "ava",
]

const MALE_NAMES = [
  "david", "mark", "james", "george", "daniel", "alex", "fred", "ryan", "thomas", "oliver",
  "arthur", "aaron", "gordon", "rishi", "richard", "guy", "tom",
]

// Android's Google voices have no human names, only codes like "en-us-x-iol-local".
// These are the three-letter codes of the English voices (US, UK, AU) and their gender.
const ANDROID_MALE = new Set(["iol", "iom", "tpd", "gbb", "gbd", "rjs", "aub", "aud"])
const ANDROID_FEMALE = new Set(["iob", "iof", "iog", "sfg", "tpc", "tpf", "gba", "gbc", "fis", "aua", "auc"])

const hasWord = (lower, words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(lower))

// "female" is checked before "male", and both as whole words, so "Female" is never read as "male".
// Looks at the voice name and, when given, its URI (Android puts the code there).
// Returns "female", "male" or "unknown" (for example "Google US English" says nothing about gender).
export function genderOf(name, uri = "") {
  const lower = `${name ?? ""} ${uri ?? ""}`.toLowerCase()

  if (lower.includes("#female")) return "female"
  if (lower.includes("#male")) return "male"
  const code = lower.match(/-x-([a-z]{3})\b/)?.[1]
  if (code && ANDROID_FEMALE.has(code)) return "female"
  if (code && ANDROID_MALE.has(code)) return "male"

  if (/\bfemale\b/.test(lower) || hasWord(lower, FEMALE_NAMES)) return "female"
  if (/\bmale\b/.test(lower) || hasWord(lower, MALE_NAMES)) return "male"
  return "unknown"
}

// Local voices first (they work offline and report word timing, which the avatar's mouth relies
// on), then alphabetical so the choice is stable.
const best = (pool) =>
  [...pool].sort(
    (a, b) => Number(b.localService) - Number(a.localService) || String(a.name).localeCompare(String(b.name))
  )[0]

// person: one entry of INTERVIEWERS. voices: speechSynthesis.getVoices().
// Returns { voice, match }:
//   match "preferred"  the interviewer's own voice is installed
//   match "similar"    a stand-in was chosen (same language and gender where possible)
//   match "default"    nothing suitable (or no voices loaded yet): let the browser decide
export function resolveVoice(person, voices) {
  const list = Array.isArray(voices) ? voices : []
  if (list.length === 0) return { voice: null, match: "default" }

  const { names, lang, gender } = person.voice
  const wanted = names.map((n) => n.toLowerCase())
  const nameOf = (v) => String(v.name ?? "").toLowerCase()

  for (const n of wanted) {
    const hit = list.find((v) => nameOf(v) === n)
    if (hit) return { voice: hit, match: "preferred" }
  }
  // The same voice can carry a longer name on another platform ("Microsoft Mark" vs
  // "Microsoft Mark - English (United States)").
  for (const n of wanted) {
    const hit = list.find((v) => nameOf(v).includes(n))
    if (hit) return { voice: hit, match: "preferred" }
  }

  const english = list.filter((v) => normLang(v.lang).startsWith("en"))
  const sameLang = english.filter((v) => normLang(v.lang) === normLang(lang))
  const withGender = (pool) => pool.filter((v) => genderOf(v.name, v.voiceURI) === gender)

  const similar = best(withGender(sameLang)) || best(withGender(english)) || best(sameLang) || best(english)
  return similar ? { voice: similar, match: "similar" } : { voice: null, match: "default" }
}