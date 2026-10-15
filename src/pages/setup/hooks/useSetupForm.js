import { useState, useCallback, useEffect } from "react"
import {
  ROLES,
  CUSTOM_ROLE,
  MIN_ROLE_CHARS,
  SESSION_LENGTHS,
  DEFAULT_SESSION_LENGTH,
  QUESTION_TYPES,
  sanitizeRole,
} from "../../../lib/options"
import { readStored, writeStored } from "../../../lib/storage"
import { MODE_STORAGE_KEY } from "../../../lib/interviewConfig"
import { DEFAULT_LANG, DEFAULT_RATE, RATE_MIN, RATE_MAX, isValidLang } from "../../../lib/speechOptions"
import { usePreference } from "../../../common/hooks/usePreference"

const isBool = (v) => typeof v === "boolean"
const isString = (v) => typeof v === "string"
const isLength = (v) => SESSION_LENGTHS.includes(v)
const isType = (v) => QUESTION_TYPES.some((t) => t.id === v)

// Everything the user picks on the setup screen: plain choices plus the ones remembered in localStorage.
export function useSetupForm() {
  const [role, setRole] = useState(ROLES[0]) // a preset, or CUSTOM_ROLE
  const [seniority, setSeniority] = useState("Mid-level")
  const [aiMode, setAiMode] = useState(() => (readStored(MODE_STORAGE_KEY) === "full" ? "full" : "practice"))
  // What the user picked. The mode actually used also depends on browser support.
  const [inputPref, setInputPref] = useState("voice")
  const [jobDescription, setJobDescription] = useState("")

  // Persisted preferences.
  const [customRole, setCustomRole] = usePreference("interview-ai-custom-role", "", isString)
  const [questionCount, setQuestionCount] = usePreference(
    "interview-ai-length",
    DEFAULT_SESSION_LENGTH,
    isLength
  )
  const [questionType, setQuestionType] = usePreference("interview-ai-question-type", "mixed", isType)
  const [speechLang, setSpeechLang] = usePreference("interview-ai-lang", DEFAULT_LANG, isValidLang)
  const [ttsVoiceURI, setTtsVoiceURI] = usePreference("interview-ai-tts-voice", "", isString)
  const [ttsRate, setTtsRate] = usePreference(
    "interview-ai-tts-rate",
    DEFAULT_RATE,
    (v) => typeof v === "number" && v >= RATE_MIN && v <= RATE_MAX
  )
  const [followUps, setFollowUps] = usePreference("interview-ai-follow-ups", false, isBool)
  const [saveHistory, setSaveHistory] = usePreference("interview-ai-save-history", true, isBool)

  useEffect(() => {
    writeStored(MODE_STORAGE_KEY, aiMode)
  }, [aiMode])

  // The role that is actually used: the preset, or the cleaned-up custom text.
  const effectiveRole = role === CUSTOM_ROLE ? sanitizeRole(customRole) : role
  const roleReady = effectiveRole.length >= MIN_ROLE_CHARS

  // Picking an accent also drops any manually chosen voice. Otherwise a voice picked earlier
  // (say a UK one) would keep speaking after switching to Australia. With the voice cleared,
  // useTextToSpeech automatically uses the best installed voice for the new accent.
  const selectAccent = useCallback(
    (code) => {
      if (!isValidLang(code)) return
      setSpeechLang(code)
      setTtsVoiceURI("")
    },
    [setSpeechLang, setTtsVoiceURI]
  )

  return {
    role,
    setRole,
    customRole,
    setCustomRole,
    effectiveRole,
    roleReady,
    seniority,
    setSeniority,
    aiMode,
    setAiMode,
    inputPref,
    setInputPref,
    jobDescription,
    setJobDescription,
    questionCount,
    setQuestionCount,
    questionType,
    setQuestionType,
    speechLang,
    selectAccent,
    ttsVoiceURI,
    setTtsVoiceURI,
    ttsRate,
    setTtsRate,
    followUps,
    setFollowUps,
    saveHistory,
    setSaveHistory,
  }
}