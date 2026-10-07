import {
  DEFAULT_LANG,
  DEFAULT_RATE,
  RATE_MIN,
  RATE_MAX,
  PREVIEW_TEXT,
  isValidLang,
} from "../lib/speechOptions"

export const QUESTION_COUNT = 6
// Job-description questions. Keep MIN/MAX in step with api/evaluate.js.
export const JD_QUESTION_COUNT = 3
export const MIN_JD_CHARS = 40
export const MAX_JD_CHARS = 4000

// Follow-ups (Full AI Mode only). Each one costs one AI evaluation.
export const MAX_FOLLOW_UPS = 2 // per interview
const FOLLOW_UP_EVERY = 2 // considered after the 2nd, 4th, 6th main question, so they're spread out
const MIN_FOLLOW_UP_WORDS = 15 // shorter answers give the AI nothing to probe
// One for the follow-up itself, one still needed for the final scoring.
const FOLLOW_UP_MIN_QUOTA = 2
// To enable the toggle: 1 scoring + the maximum number of follow-ups.
const FOLLOW_UP_SETUP_QUOTA = 1 + MAX_FOLLOW_UPS

const MODE_STORAGE_KEY = "interview-ai-mode"
const isBool = (v) => typeof v === "boolean"

// Owns everything about running an interview: setup choices, speech in/out, the question loop,
// scoring, retrying a weak answer, follow-ups, the AI quota meter, and saving. App.jsx and the
// screen components only render what this returns.
//
// Returns { screen, setScreen, setup, interview, summary }.
export function useInterview({ user, authLoading }) {
  const uid = user?.uid

  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary" | "history"
  const [role, setRole] = useState(ROLES[0])
  const [seniority, setSeniority] = useState("Mid-level")
  const [aiMode, setAiMode] = useState(() => (readStored(MODE_STORAGE_KEY) === "full" ? "full" : "practice"))
  // What the user picked on the setup screen. The mode actually used also depends on browser support.
  const [inputPref, setInputPref] = useState("voice")
  const [notice, setNotice] = useState(null)
  const [jobDescription, setJobDescription] = useState("")
  const [starting, setStarting] = useState(false) // true while tailored questions are being generated
  const [sessionNote, setSessionNote] = useState(null) // shown during the interview (e.g. "3 questions are tailored...")

  // Persisted preferences.
  const [speechLang, setSpeechLang] = usePreference("interview-ai-lang", DEFAULT_LANG, isValidLang)
  const [ttsVoiceURI, setTtsVoiceURI] = usePreference("interview-ai-tts-voice", "", (v) => typeof v === "string")
  const [ttsRate, setTtsRate] = usePreference(
    "interview-ai-tts-rate",
    DEFAULT_RATE,
    (v) => typeof v === "number" && v >= RATE_MIN && v <= RATE_MAX
  )
  const [followUps, setFollowUps] = usePreference("interview-ai-follow-ups", false, isBool)
  const [saveHistory, setSaveHistory] = usePreference("interview-ai-save-history", true, isBool)

  // { remaining, limit, globalExhausted } from the server, or null while unknown.
  const [quota, setQuota] = useState(null)
  const [quotaStatus, setQuotaStatus] = useState("idle") // "idle" | "loading" | "ready" | "error"

  const [orbState, setOrbState] = useState("idle") // "idle" | "listening" | "thinking" | "speaking"
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionTotal, setQuestionTotal] = useState(QUESTION_COUNT)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [inputMode, setInputMode] = useState("voice") // how the interview in progress is answered
  const [session, setSession] = useState([])
  const [sessionMeta, setSessionMeta] = useState(null) // { role, seniority, mode, date } for the PDF export
  const [overallSummary, setOverallSummary] = useState("")
  const [saveStatus, setSaveStatus] = useState("idle") // "idle" | "saving" | "saved" | "error" | "skipped"
  const [error, setError] = useState(null)
  // True while a score is being computed (the whole interview, or a retried answer).
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)
  // Follow-up state: the current question is a follow-up / one is being generated right now.
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [preparingFollowUp, setPreparingFollowUp] = useState(false)
  // { remaining, limit } from the last Full AI evaluation, or null (Practice Mode / not yet scored).
  const [usage, setUsage] = useState(null)
  // Locked in when the interview starts, so toggling the switch mid-interview
  // never changes how the session already in progress gets scored.
  const [sessionMode, setSessionMode] = useState("practice")

  // Retry flow: which answer (by index) is being re-answered, and the results so far.
  const [retryIndex, setRetryIndex] = useState(null)
  const [retryResults, setRetryResults] = useState({}) // index -> { answer, inputMethod, metrics, evaluation, mode }

  const promptShownAtRef = useRef(null)
  const questionsRef = useRef([])
  const questionIndexRef = useRef(0)
  const currentQuestionRef = useRef("")
  const qasRef = useRef([])
  const inputModeRef = useRef("voice")
  const pendingSaveRef = useRef(null) // { sessionId, data } for the finished session, kept for retries
  // Role, seniority, mode, privacy and follow-up choices are locked in at startInterview() and read
  // from here later. This is what keeps scoring from using stale values from an old render.
  const sessionConfigRef = useRef({
    role: ROLES[0],
    seniority: "Mid-level",
    mode: "practice",
    save: true,
    followUps: false,
  })
  // Bumped whenever an interview starts or is torn down, so late async results
  // (e.g. a scoring response arriving after sign-out) can be recognized as stale and dropped.
  const interviewIdRef = useRef(0)
  // Same idea for the retry flow: bumped when a retry starts or is cancelled.
  const retryRunRef = useRef(0)
  const retryIndexRef = useRef(null)
  const retryAttemptRef = useRef(null) // { question, answer, metrics, inputMethod } waiting to be scored
  const retryModeRef = useRef("practice") // "practice" | "full" for the retry in progress
  // Follow-up bookkeeping.
  const isFollowUpRef = useRef(false)
  const followUpsUsedRef = useRef(0)
  const followUpRunRef = useRef(0) // bumped to ignore a follow-up response that arrives late
  const quotaRef = useRef(null) // mirrors `quota` so async code never reads a stale value
  // Always points at the right answer handler (main flow or retry flow). Speech callbacks call
  // through this ref, which breaks the presentQuestion <-> handleAnswer dependency cycle without
  // stale closures.
  const answerRouterRef = useRef(() => {})

  const [support] = useState(getSupport)
  const mic = useMicPermission()
  const voiceOk = voiceAvailable(support, mic.state)
  const setupMode = voiceOk && inputPref === "voice" ? "voice" : "text"

  const {
    isListening,
    subscribeTranscript,
    getTranscript,
    startListening,
    finishAnswer,
    stopListening,
  } = useSpeechRecognition()
  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: ttsSupported,
    subscribeWord,
    voices,
  } = useTextToSpeech({ voiceURI: ttsVoiceURI, rate: ttsRate, lang: speechLang })
  // The mic stream is opened once per interview (acquireMic is idempotent) and released at the end.
  // getLevel is polled by the Orb directly, so mic volume never causes a re-render.
  const { getLevel, acquireMic, releaseMic } = useAudioLevel()

  // ---------- quota ----------

  const commitQuota = useCallback((next) => {
    quotaRef.current = next
    setQuota(next)
  }, [])

  // Full AI is blocked only when the server says so. While the quota is unknown (loading, failed),
  // Full AI stays available and the server enforces the limit anyway.
  const quotaExhausted = !!quota && (quota.remaining <= 0 || quota.globalExhausted)
  // The stored preference is kept as-is, but the mode actually used drops to Practice while exhausted.
  const effectiveMode = aiMode === "full" && !quotaExhausted ? "full" : "practice"
  // Tailored questions cost one evaluation and scoring needs another, so require two.
  const jdAvailable = effectiveMode === "full" && (!quota || quota.remaining >= 2)
  // Follow-ups need Full AI Mode and enough quota for scoring plus the follow-ups themselves.
  const followUpsAvailable = effectiveMode === "full" && (!quota || quota.remaining >= FOLLOW_UP_SETUP_QUOTA)

  const applyUsage = useCallback((info) => {
    if (!info) return
    commitQuota({ remaining: info.remaining, limit: info.limit, globalExhausted: false })
  }, [commitQuota])

  const refreshQuota = useCallback(async () => {
    if (!uid) return
    setQuotaStatus("loading")
    try {
      const latest = await fetchUsage()
      if (latest) commitQuota(latest)
      setQuotaStatus("ready")
    } catch (err) {
      console.error("Couldn't load AI quota:", err)
      setQuotaStatus("error")
    }
  }, [uid, commitQuota])

  // Refresh whenever the setup screen is shown (first load, and after finishing an interview).
  useEffect(() => {
    if (uid && screen === "setup") refreshQuota()
  }, [uid, screen, refreshQuota])

  useEffect(() => {
    writeStored(MODE_STORAGE_KEY, aiMode)
  }, [aiMode])

  // ---------- saving to history ----------

  const runSave = useCallback(async (interviewId) => {
    const pending = pendingSaveRef.current
    if (!pending || !uid) return
    setSaveStatus("saving")
    try {
      await saveSession(uid, pending.sessionId, pending.data)
      if (interviewIdRef.current === interviewId) setSaveStatus("saved")
    } catch (err) {
      console.error("Couldn't save session:", err)
      if (interviewIdRef.current === interviewId) setSaveStatus("error")
    }
  }, [uid])

  const queueSave = useCallback((data, interviewId) => {
    if (!uid) return
    pendingSaveRef.current = { sessionId: newSessionId(uid), data }
    runSave(interviewId)
  }, [uid, runSave])

  // ---------- follow-up helpers ----------

  const clearFollowUp = useCallback(() => {
    isFollowUpRef.current = false
    setIsFollowUp(false)
    setPreparingFollowUp(false)
  }, [])

  // ---------- speech callbacks ----------

  // User pressed "I'm done" (or the backstop fired) but nothing was captured.
  const handleEmptyAnswer = useCallback(() => {
    setOrbState("idle")
    setError("We didn't catch any speech. Check that your microphone is working and try again, or type your answer instead.")
  }, [])

  // Mic blocked, recognition unsupported, or recognition kept failing.
  const handleListenError = useCallback((message) => {
    setOrbState("idle")
    setError(message)
  }, [])

  // Starts collecting an answer for the current question. In voice mode that means listening;
  // in text mode the textarea is already on screen, so there's nothing to start.
  const beginAnswering = useCallback(() => {
    // Response delay is measured from when the interviewer finishes speaking,
    // not from when the question started being read aloud.
    promptShownAtRef.current = Date.now()

    if (inputModeRef.current === "text") {
      setOrbState("idle")
      return
    }

    setOrbState("listening")
    startListening({
      promptShownAt: promptShownAtRef.current,
      lang: speechLang,
      onFinal: (answerText, metrics) => answerRouterRef.current(answerText, metrics, "voice"),
      onEmpty: handleEmptyAnswer,
      onError: handleListenError,
    })
  }, [startListening, speechLang, handleEmptyAnswer, handleListenError])

  const presentQuestion = useCallback((question) => {
    // Stop listening first, otherwise the recognizer would transcribe the question being read aloud.
    stopListening()
    setCurrentQuestion(question)
    currentQuestionRef.current = question
    setOrbState("speaking")

    // Opens the mic on the first question (or retries if it failed earlier); no-op afterwards.
    // Not awaited: the level meter is cosmetic and must never block the interview.
    if (inputModeRef.current === "voice") acquireMic()

    speak(question, beginAnswering)
  }, [stopListening, speak, acquireMic, beginAnswering])

   // ---------- accent + voice previews (setup screen) ----------

  // Picking an accent also drops any manually chosen voice. Otherwise a voice picked earlier
  // (say a UK one) would keep speaking after switching to Australia. With the voice cleared,
  // useTextToSpeech automatically uses the best installed voice for the new accent.
  const selectAccent = useCallback((code) => {
    if (!isValidLang(code)) return
    setSpeechLang(code)
    setTtsVoiceURI("")
  }, [setSpeechLang, setTtsVoiceURI])

  // Plays one accent's automatic voice, regardless of what is currently selected.
  const previewAccent = useCallback((code, onEnd) => {
    speak(PREVIEW_TEXT, onEnd, { voiceURI: "", lang: code })
  }, [speak])

  // Plays the current accent, voice and speed settings together.
  const previewVoice = useCallback((onEnd) => {
    speak(PREVIEW_TEXT, onEnd)
  }, [speak])

  const stopPreview = stopSpeaking

  // ---------- flow ----------

  // Tears everything down: speech, recognition, mic stream, and any in-flight scoring.
  const restart = useCallback(() => {
    interviewIdRef.current++
    retryRunRef.current++
    followUpRunRef.current++
    stopSpeaking()
    stopListening()
    releaseMic()
    setScreen("setup")
    qasRef.current = []
    questionsRef.current = []
    questionIndexRef.current = 0
    followUpsUsedRef.current = 0
    pendingSaveRef.current = null
    retryIndexRef.current = null
    retryAttemptRef.current = null
    setRetryIndex(null)
    setRetryResults({})
    setQuestionIndex(0)
    setAnsweredCount(0)
    setSession([])
    setSessionMeta(null)
    setOverallSummary("")
    setUsage(null)
    setSaveStatus("idle")
    setCurrentQuestion("")
    currentQuestionRef.current = ""
    setOrbState("idle")
    setError(null)
    setNotice(null)
    setSessionNote(null)
    setStarting(false)
    setAwaitingFinalScore(false)
    clearFollowUp()
  }, [stopSpeaking, stopListening, releaseMic, clearFollowUp])

  // forceMode lets the user re-score a finished interview locally when the AI is unavailable.
  const runFinalScoring = useCallback(async (forceMode) => {
    const interviewId = interviewIdRef.current
    const config = sessionConfigRef.current
    const mode = forceMode || config.mode
    if (mode !== config.mode) {
      sessionConfigRef.current = { ...config, mode }
      setSessionMode(mode)
    }

    // All answers are in, so the interview is over: release the mic now.
    releaseMic()

    setAwaitingFinalScore(true)
    setOrbState("thinking")
    setError(null)

    try {
      const { evaluations, overallSummary: summaryText, usage: usageInfo } = await evaluateSession({
        role: config.role,
        seniority: config.seniority,
        qas: qasRef.current,
        mock: mode === "practice",
      })

      // The user left (signed out / restarted) while we were waiting - drop the result.
      if (interviewIdRef.current !== interviewId) return

      const finalSession = qasRef.current.map((qa, i) => ({
        question: qa.question,
        answer: qa.answer,
        inputMethod: qa.inputMethod,
        isFollowUp: !!qa.isFollowUp,
        metrics: qa.metrics,
        evaluation: evaluations[i],
      }))

      setSession(finalSession)
      setSessionMeta({ role: config.role, seniority: config.seniority, mode, date: new Date() })
      setOverallSummary(summaryText || "")
      setUsage(mode === "full" ? usageInfo : null)
      if (mode === "full") applyUsage(usageInfo)
      setScreen("summary")
      setOrbState("idle")
      setAwaitingFinalScore(false)

      if (config.save) {
        queueSave(
          { role: config.role, seniority: config.seniority, mode, overallSummary: summaryText || "", session: finalSession },
          interviewId
        )
      } else {
        // Private session: nothing is written to Firestore.
        pendingSaveRef.current = null
        setSaveStatus("skipped")
      }
    } catch (err) {
      if (interviewIdRef.current !== interviewId) return
      console.error("Failed to score the session:", err)
      setError(messageForError(err))
      setOrbState("idle")
    }
  }, [releaseMic, queueSave, applyUsage])

  // Called when the last question is done, or the user ends early.
  const finishInterview = useCallback(() => {
    if (qasRef.current.length === 0) {
      restart()
      setNotice("You didn't answer any questions, so there was nothing to score. Start again whenever you're ready.")
      return
    }
    runFinalScoring()
  }, [restart, runFinalScoring])

  // Moves on to the next MAIN question, or finishes if that was the last one.
  // Always leaves any follow-up state behind.
  const advance = useCallback(() => {
    clearFollowUp()
    const next = questionIndexRef.current + 1
    if (next >= questionsRef.current.length) {
      finishInterview()
      return
    }
    questionIndexRef.current = next
    setQuestionIndex(next)
    presentQuestion(questionsRef.current[next])
  }, [clearFollowUp, finishInterview, presentQuestion])

  const handleAnswer = useCallback(async (answerText, metrics, inputMethod = "voice") => {
    setError(null)

    const wasFollowUp = isFollowUpRef.current
    const question = currentQuestionRef.current
    const updated = [
      ...qasRef.current,
      { question, answer: answerText, metrics, inputMethod, isFollowUp: wasFollowUp },
    ]
    qasRef.current = updated
    setAnsweredCount(updated.length)

    // Should the AI probe this answer? Only in Full AI Mode, only on a main question, spread out
    // through the interview, capped, only for substantial answers, and only with quota to spare.
    const config = sessionConfigRef.current
    const wordCount = answerText.trim().split(/\s+/).filter(Boolean).length
    const q = quotaRef.current
    const wantsFollowUp =
      !wasFollowUp &&
      config.followUps &&
      config.mode === "full" &&
      followUpsUsedRef.current < MAX_FOLLOW_UPS &&
      (questionIndexRef.current + 1) % FOLLOW_UP_EVERY === 0 &&
      wordCount >= MIN_FOLLOW_UP_WORDS &&
      !(q && (q.remaining < FOLLOW_UP_MIN_QUOTA || q.globalExhausted))

    if (wantsFollowUp) {
      const interviewId = interviewIdRef.current
      const runId = ++followUpRunRef.current
      setPreparingFollowUp(true)
      setOrbState("thinking")

      try {
        const result = await generateFollowUp({
          role: config.role,
          seniority: config.seniority,
          question,
          answer: answerText,
        })
        // Restarted, signed out, or the user skipped the follow-up while we waited.
        if (interviewIdRef.current !== interviewId || followUpRunRef.current !== runId) return

        applyUsage(result.usage)
        followUpsUsedRef.current++
        isFollowUpRef.current = true
        setIsFollowUp(true)
        setPreparingFollowUp(false)
        presentQuestion(result.question)
        return
      } catch (err) {
        if (interviewIdRef.current !== interviewId || followUpRunRef.current !== runId) return
        // A failed follow-up is never worth interrupting the interview: just carry on.
        console.error("Couldn't generate a follow-up:", err)
      }
    }

    advance()
  }, [advance, applyUsage, presentQuestion])

  // Gives up waiting for a follow-up and moves on.
  const skipFollowUp = () => {
    followUpRunRef.current++
    advance()
  }

  // ---------- retrying the weakest answer ----------

  // Scores the re-answered question on its own. The original session (and its saved history entry)
  // is left untouched: the retry result is shown next to it for comparison.
  const runRetryScoring = useCallback(async (forceMode) => {
    const index = retryIndexRef.current
    const attempt = retryAttemptRef.current
    if (index === null || !attempt) return

    const runId = retryRunRef.current
    const interviewId = interviewIdRef.current
    const config = sessionConfigRef.current
    const mode = forceMode || retryModeRef.current
    if (forceMode) retryModeRef.current = forceMode

    releaseMic()
    setAwaitingFinalScore(true)
    setOrbState("thinking")
    setError(null)

    try {
      const { evaluations, usage: usageInfo } = await evaluateSession({
        role: config.role,
        seniority: config.seniority,
        qas: [attempt],
        mock: mode === "practice",
      })

      if (interviewIdRef.current !== interviewId || retryRunRef.current !== runId) return

      if (mode === "full") applyUsage(usageInfo)
      setRetryResults((prev) => ({
        ...prev,
        [index]: {
          answer: attempt.answer,
          inputMethod: attempt.inputMethod,
          metrics: attempt.metrics,
          evaluation: evaluations[0],
          mode,
        },
      }))
      retryIndexRef.current = null
      retryAttemptRef.current = null
      setRetryIndex(null)
      setAwaitingFinalScore(false)
      setOrbState("idle")
      setScreen("summary")
    } catch (err) {
      if (interviewIdRef.current !== interviewId || retryRunRef.current !== runId) return
      console.error("Failed to score the retry:", err)
      setError(messageForError(err))
      setOrbState("idle")
    }
  }, [releaseMic, applyUsage])

  const handleRetryAnswer = useCallback((answerText, metrics, inputMethod = "voice") => {
    setError(null)
    retryAttemptRef.current = { question: currentQuestionRef.current, answer: answerText, metrics, inputMethod }
    runRetryScoring()
  }, [runRetryScoring])

  useEffect(() => {
    answerRouterRef.current = (answerText, metrics, inputMethod) => {
      if (retryIndexRef.current !== null) handleRetryAnswer(answerText, metrics, inputMethod)
      else handleAnswer(answerText, metrics, inputMethod)
    }
  }, [handleAnswer, handleRetryAnswer])

  const startRetry = (index) => {
    const qa = qasRef.current[index]
    if (!qa) return

    const baseMode = sessionConfigRef.current.mode
    // If the AI quota ran out since the interview, score the retry locally instead of failing.
    retryModeRef.current = baseMode === "full" && quotaExhausted ? "practice" : baseMode

    retryRunRef.current++
    retryIndexRef.current = index
    retryAttemptRef.current = null
    inputModeRef.current = setupMode
    clearFollowUp()

    setRetryIndex(index)
    setInputMode(setupMode)
    setAwaitingFinalScore(false)
    setError(null)
    setScreen("interview")

    presentQuestion(qa.question)
  }

  const cancelRetry = () => {
    retryRunRef.current++
    stopSpeaking()
    stopListening()
    releaseMic()
    retryIndexRef.current = null
    retryAttemptRef.current = null
    setRetryIndex(null)
    setAwaitingFinalScore(false)
    setOrbState("idle")
    setError(null)
    setScreen("summary")
  }

  // ---------- starting an interview ----------

  const startInterview = async () => {
    if (starting) return

    // Capture the setup choices now: the user could touch the form while questions are generated.
    const mode = effectiveMode
    const chosenRole = role
    const chosenSeniority = seniority
    const jd = jobDescription.trim()
    const useJd = jdAvailable && jd.length >= MIN_JD_CHARS
    const save = saveHistory
    const useFollowUps = followUps && followUpsAvailable

    const interviewId = ++interviewIdRef.current
    setNotice(null)

    let custom = []
    let note = null
    if (useJd) {
      setStarting(true)
      try {
        const result = await generateQuestions({
          role: chosenRole,
          seniority: chosenSeniority,
          jobDescription: jd,
          count: JD_QUESTION_COUNT,
        })
        custom = result.questions
        applyUsage(result.usage)
        note = `${custom.length} of these questions are tailored to the job description you pasted.`
      } catch (err) {
        console.error("Couldn't generate tailored questions:", err)
        note = "Couldn't generate job-specific questions, so a standard set was used."
      } finally {
        setStarting(false)
      }
      // The user signed out or restarted while we were waiting.
      if (interviewIdRef.current !== interviewId) return
    }

    sessionConfigRef.current = {
      role: chosenRole,
      seniority: chosenSeniority,
      mode,
      save,
      followUps: useFollowUps && mode === "full",
    }
    inputModeRef.current = setupMode
    qasRef.current = []
    pendingSaveRef.current = null
    retryIndexRef.current = null
    retryAttemptRef.current = null
    retryRunRef.current++
    followUpRunRef.current++
    followUpsUsedRef.current = 0

    const questions = pickQuestions(chosenRole, chosenSeniority, QUESTION_COUNT, {
      recent: getRecentQuestions(),
      custom,
    })
    rememberQuestions(questions.filter((q) => !custom.includes(q)))
    questionsRef.current = questions
    questionIndexRef.current = 0

    setInputMode(setupMode)
    setSessionMode(mode)
    setQuestionIndex(0)
    setQuestionTotal(questions.length)
    setAnsweredCount(0)
    setSession([])
    setSessionMeta(null)
    setOverallSummary("")
    setUsage(null)
    setSaveStatus("idle")
    setRetryIndex(null)
    setRetryResults({})
    setError(null)
    setNotice(null)
    setSessionNote(note)
    setAwaitingFinalScore(false)
    clearFollowUp()
    setScreen("interview")

    presentQuestion(questions[0])
  }

  // ---------- interview controls ----------

  const retry = () => {
    setError(null)
    if (awaitingFinalScore) {
      if (retryIndexRef.current !== null) runRetryScoring()
      else runFinalScoring()
    } else {
      presentQuestion(currentQuestionRef.current)
    }
  }

  // Reads the question again. Any answer in progress is discarded, since the mic has to be off while it speaks.
  const replay = () => {
    setError(null)
    presentQuestion(currentQuestionRef.current)
  }

  // Throws away what was said so far and starts listening again, without re-reading the question.
  const reRecord = () => {
    setError(null)
    stopSpeaking()
    beginAnswering()
  }

  // Skips the current question (or the current follow-up) and moves on to the next main question.
  const skip = () => {
    stopSpeaking()
    stopListening()
    setError(null)
    advance()
  }

  const endEarly = () => {
    stopSpeaking()
    stopListening()
    setError(null)
    followUpRunRef.current++
    clearFollowUp()
    finishInterview()
  }

  const switchToText = () => {
    stopListening()
    releaseMic()
    inputModeRef.current = "text"
    setInputMode("text")
    setError(null)
    promptShownAtRef.current = Date.now()
    // If the question is still being read, the orb keeps its speaking state until it finishes.
    if (!isSpeaking) setOrbState("idle")
  }

  const switchToVoice = () => {
    inputModeRef.current = "voice"
    setInputMode("voice")
    setError(null)
    acquireMic()
    // If the question is still being read, listening starts when it finishes.
    if (!isSpeaking) beginAnswering()
  }

  // The typed text itself lives in the TypingPanel component, so keystrokes don't re-render the app.
  const submitTyped = (rawText) => {
    const text = rawText.trim()
    if (!text) return
    stopSpeaking()
    // Typed answers have no pace or response delay, so those are left at 0 and flagged via inputMethod.
    answerRouterRef.current(text, { wpm: 0, fillerCount: countFillers(text), responseDelaySec: 0 }, "text")
  }

  const scoreWithPractice = () => {
    if (retryIndexRef.current !== null) runRetryScoring("practice")
    else runFinalScoring("practice")
  }

  const retrySave = () => runSave(interviewIdRef.current)

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) {
      restart()
      commitQuota(null)
      setQuotaStatus("idle")
    }
  }, [user, authLoading, restart, commitQuota])

  // The weakest answer that hasn't been retried yet (-1 when there's nothing left to retry).
  const weakestIndex = useMemo(
    () => findWeakestIndex(session, new Set(Object.keys(retryResults).map(Number))),
    [session, retryResults]
  )

  return {
    screen,
    setScreen,

    setup: {
      role,
      setRole,
      seniority,
      setSeniority,
      aiMode: effectiveMode,
      setAiMode,
      quota,
      quotaStatus,
      quotaExhausted,
      refreshQuota,
      jobDescription,
      setJobDescription,
      jdAvailable,
      followUps,
      setFollowUps,
      followUpsAvailable,
      saveHistory,
      setSaveHistory,
      speechLang,
      selectAccent,
      ttsVoiceURI,
      setTtsVoiceURI,
      ttsRate,
      setTtsRate,
      voices,
      previewAccent,
      previewVoice,
      stopPreview,
      starting,
      setupMode,
      setInputPref,
      support,
      mic,
      notice,
      questionCount: QUESTION_COUNT,
      maxFollowUps: MAX_FOLLOW_UPS,
      start: startInterview,
    },

    interview: {
      orbState,
      currentQuestion,
      questionIndex,
      questionTotal,
      answeredCount,
      inputMode,
      error,
      awaitingFinalScore,
      sessionMode,
      sessionNote,
      isFollowUp,
      preparingFollowUp,
      skipFollowUp,
      isRetry: retryIndex !== null,
      retryQuestionNumber: retryIndex !== null ? retryIndex + 1 : null,
      voiceOk,
      ttsSupported,
      isListening,
      getLevel,
      subscribeWord,
      subscribeTranscript,
      getTranscript,
      finishAnswer,
      submitTyped,
      retry,
      replay,
      reRecord,
      skip,
      endEarly,
      cancelRetry,
      switchToText,
      switchToVoice,
      scoreWithPractice,
    },

    summary: {
      session,
      meta: sessionMeta,
      overallSummary,
      sessionMode,
      usage,
      saveStatus,
      retrySave,
      restart,
      retryResults,
      weakestIndex,
      startRetry,
      retryUsesAi: sessionMode === "full" && !quotaExhausted,
    },
  }
}