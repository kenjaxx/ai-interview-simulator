import { useState, useCallback, useRef, useEffect } from "react"
import Orb from "./components/Orb"
import Header from "./components/Header"
import Login from "./components/Login"
import ModeToggle from "./components/ModeToggle"
import { useAuth } from "./context/AuthContext"
import { useSpeechRecognition } from "./hooks/useSpeechRecognition"
import { useTextToSpeech } from "./hooks/useTextToSpeech"
import { useAudioLevel } from "./hooks/useAudioLevel"
import { evaluateSession } from "./lib/gemini"
import { pickQuestions } from "./lib/questions"
import "./App.css"

const QUESTION_COUNT = 6
const MODE_STORAGE_KEY = "interview-ai-mode"

const ROLE_OPTIONS = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst / Data Scientist",
  "QA / Test Engineer",
  "Tech Support / IT Support",
  "Product Manager",
  "UI/UX Designer",
]

function messageForError(err) {
  if (err?.status === 401) {
    return "Your session expired. Please sign out and sign in again."
  }

  if (err?.isQuotaError) {
    // Your personal daily allowance is used up
    if (err.limitScope === "user" && err.isDailyQuota) {
      return "You've used all of your AI evaluations for today. They reset at midnight UTC — switch to Practice Mode for unlimited local scoring."
    }
    // The whole app's daily budget is used up
    if (err.limitScope === "global") {
      return "The app's daily AI budget has been used up. Try Practice Mode, or come back tomorrow."
    }
    // Gemini's own daily quota
    if (err.isDailyQuota) {
      return "The AI service has hit its daily request limit. It resets at midnight Pacific Time — switch to Practice Mode for unlimited local scoring."
    }
    return err.retryAfterSeconds
      ? `Too many requests right now — try again in about ${err.retryAfterSeconds}s.`
      : "You've hit the AI request limit for now. Please wait a bit and try again."
  }

  if (err?.status === 503) {
    return "Couldn't check your usage limit right now. Please try again in a moment."
  }

  return "Couldn't reach the interviewer AI. Check your connection and try again."
}

export default function App() {
  const { user, authLoading } = useAuth()

  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary"
  const [role, setRole] = useState(ROLE_OPTIONS[0])
  const [seniority, setSeniority] = useState("Mid-level")
  const [aiMode, setAiMode] = useState(() => {
    if (typeof window === "undefined") return "practice"
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "full" ? "full" : "practice"
  })

  const [orbState, setOrbState] = useState("idle") // "idle" | "listening" | "thinking" | "speaking"
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [answeredCount, setAnsweredCount] = useState(0)
  const [session, setSession] = useState([])
  const [overallSummary, setOverallSummary] = useState("")
  const [error, setError] = useState(null)
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)
  // Locked in when the interview starts, so toggling the switch mid-interview
  // never changes how the session already in progress gets scored.
  const [sessionMode, setSessionMode] = useState("practice")

  const promptShownAtRef = useRef(null)
  const questionsRef = useRef([])
  const currentQuestionRef = useRef("")
  const qasRef = useRef([])
  // Role, seniority and mode are locked in at startInterview() and read from here by the
  // scoring call. This is what keeps scoring from using stale values from an old render.
  const sessionConfigRef = useRef({ role: ROLE_OPTIONS[0], seniority: "Mid-level", mode: "practice" })
  // Bumped whenever an interview starts or is torn down, so late async results
  // (e.g. a scoring response arriving after sign-out) can be recognized as stale and dropped.
  const interviewIdRef = useRef(0)
  // Always points at the latest handleAnswer. Speech callbacks call through this ref, which
  // breaks the presentQuestion <-> handleAnswer dependency cycle without stale closures.
  const handleAnswerRef = useRef(() => {})

  const { isListening, transcript, startListening, finishAnswer, stopListening } = useSpeechRecognition()
  const { speak, stop: stopSpeaking, wordTick } = useTextToSpeech()
  const { level: micLevel, startTracking, stopTracking } = useAudioLevel()

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, aiMode)
  }, [aiMode])

  // User pressed "I'm done" (or the backstop fired) but nothing was captured.
  const handleEmptyAnswer = useCallback(() => {
    stopTracking()
    setOrbState("idle")
    setError("We didn't catch any speech. Check that your microphone is working, then try this question again.")
  }, [stopTracking])

  // Mic blocked, recognition unsupported, or recognition kept failing.
  const handleListenError = useCallback((message) => {
    stopTracking()
    setOrbState("idle")
    setError(message)
  }, [stopTracking])

  const presentQuestion = useCallback((question) => {
    setCurrentQuestion(question)
    currentQuestionRef.current = question
    setOrbState("speaking")

    speak(question, () => {
      // Response delay is measured from when the interviewer finishes speaking,
      // not from when the question started being read aloud.
      promptShownAtRef.current = Date.now()
      setOrbState("listening")
      startTracking()
      startListening({
        promptShownAt: promptShownAtRef.current,
        onFinal: (answerText, metrics) => handleAnswerRef.current(answerText, metrics),
        onEmpty: handleEmptyAnswer,
        onError: handleListenError,
      })
    })
  }, [speak, startTracking, startListening, handleEmptyAnswer, handleListenError])

  const runFinalScoring = useCallback(async () => {
    const interviewId = interviewIdRef.current
    const { role: sessionRole, seniority: sessionSeniority, mode } = sessionConfigRef.current

    setAwaitingFinalScore(true)
    setOrbState("thinking")
    setError(null)

    try {
      const { evaluations, overallSummary: summaryText } = await evaluateSession({
        role: sessionRole,
        seniority: sessionSeniority,
        qas: qasRef.current,
        mock: mode === "practice",
      })

      // The user left (signed out / restarted) while we were waiting - drop the result.
      if (interviewIdRef.current !== interviewId) return

      const finalSession = qasRef.current.map((qa, i) => ({
        question: qa.question,
        answer: qa.answer,
        metrics: qa.metrics,
        evaluation: evaluations[i],
      }))

      setSession(finalSession)
      setOverallSummary(summaryText || "")
      setScreen("summary")
      setOrbState("idle")
      setAwaitingFinalScore(false)
    } catch (err) {
      if (interviewIdRef.current !== interviewId) return
      console.error("Failed to score the session:", err)
      setError(messageForError(err))
      setOrbState("idle")
    }
  }, [])

  const handleAnswer = useCallback((answerText, metrics) => {
    stopTracking()
    setError(null)

    const updated = [...qasRef.current, { question: currentQuestionRef.current, answer: answerText, metrics }]
    qasRef.current = updated
    setAnsweredCount(updated.length)

    if (updated.length >= QUESTION_COUNT) {
      runFinalScoring()
    } else {
      presentQuestion(questionsRef.current[updated.length])
    }
  }, [stopTracking, presentQuestion, runFinalScoring])

  useEffect(() => {
    handleAnswerRef.current = handleAnswer
  }, [handleAnswer])

  const retryCurrentQuestion = () => {
    setError(null)
    if (awaitingFinalScore) {
      runFinalScoring()
    } else {
      presentQuestion(currentQuestionRef.current)
    }
  }

  const startInterview = () => {
    interviewIdRef.current++
    sessionConfigRef.current = { role, seniority, mode: aiMode }
    qasRef.current = []
    setSessionMode(aiMode)
    setAnsweredCount(0)
    setSession([])
    setOverallSummary("")
    setError(null)
    setAwaitingFinalScore(false)
    setScreen("interview")

    questionsRef.current = pickQuestions(role, QUESTION_COUNT)
    presentQuestion(questionsRef.current[0])
  }

  // Tears everything down: speech, recognition, mic tracking, and any in-flight scoring.
  const restart = useCallback(() => {
    interviewIdRef.current++
    stopSpeaking()
    stopListening()
    stopTracking()
    setScreen("setup")
    qasRef.current = []
    setAnsweredCount(0)
    questionsRef.current = []
    setSession([])
    setOverallSummary("")
    setCurrentQuestion("")
    currentQuestionRef.current = ""
    setOrbState("idle")
    setError(null)
    setAwaitingFinalScore(false)
  }, [stopSpeaking, stopListening, stopTracking])

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) restart()
  }, [user, authLoading, restart])

  if (authLoading) {
    return (
      <div className="page-loading">
        <div className="page-loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (screen === "setup") {
    return (
      <div className="page">
        <Header />
        <header className="hero">
          <p className="eyebrow">AI Interview Coach</p>
          <h1>Practice out loud.<br />Get real feedback.</h1>
          <p className="hero-sub">
            A live, voice-driven mock interview. Answer out loud, and once you're
            done the AI scores your content, clarity, and confidence based on what you actually said.
          </p>
        </header>

        <div className="setup-card">
          <div className="field">
            <label htmlFor="role">Target role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="seniority">Seniority</label>
            <select id="seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option>Entry-level</option>
              <option>Mid-level</option>
              <option>Senior</option>
            </select>
          </div>

          <ModeToggle mode={aiMode} onChange={setAiMode} />

          <button className="primary-btn" onClick={startInterview}>Start interview</button>
          <p className="setup-note">You'll need microphone access — {QUESTION_COUNT} questions, spoken answers.</p>
          <p className="setup-note">
            Privacy: speech-to-text is done by your browser, and Chrome and Edge send audio to their
            own cloud services for that. In Full AI Mode, your transcribed answers are also sent to
            Google's Gemini API for scoring. Practice Mode scores locally and sends nothing to our AI.
          </p>
        </div>
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <div className="page">
        <Header />
        <div className="interview-shell">
          <p className="progress-label">
            {awaitingFinalScore
              ? "Scoring your interview…"
              : `Question ${Math.min(answeredCount + 1, QUESTION_COUNT)} of ${QUESTION_COUNT}`}
          </p>

          <Orb state={orbState} micLevel={micLevel} wordTick={wordTick} />

          {!awaitingFinalScore && <p className="question-text">{currentQuestion}</p>}

          {isListening && (
            <div className="listening-panel">
              <p className="live-transcript">{transcript || "Listening…"}</p>
              <button className="finish-btn" onClick={finishAnswer}>
                ✓ I'm done — submit answer
              </button>
            </div>
          )}

          {error && (
            <div className="error-panel">
              <p>{error}</p>
              <button className="secondary-btn" onClick={retryCurrentQuestion}>
                {awaitingFinalScore ? "Retry scoring" : "Retry this question"}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // summary screen
  const avg = (key) => Math.round(
    session.reduce((sum, e) => sum + e.evaluation[key], 0) / session.length
  )

  return (
    <div className="page">
      <Header />
      <div className="summary-shell">
        <div className="summary-heading-row">
          <h1>Session summary</h1>
          <span className={`mode-badge ${sessionMode === "full" ? "mode-badge--full" : ""}`}>
            {sessionMode === "full" ? "Full AI Mode" : "Practice Mode"}
          </span>
        </div>

        {overallSummary && <p className="hero-sub" style={{ margin: "0 0 1.75rem", textAlign: "left" }}>{overallSummary}</p>}

        <div className="score-row">
          <div className="score-card"><span>{avg("contentScore")}</span><label>Content</label></div>
          <div className="score-card"><span>{avg("clarityScore")}</span><label>Clarity</label></div>
          <div className="score-card"><span>{avg("confidenceScore")}</span><label>Confidence</label></div>
        </div>

        {session.map((entry, i) => (
          <div className="review-card" key={i}>
            <p className="review-question">{entry.question}</p>
            <p className="review-answer">{entry.answer}</p>
            <p className="review-feedback">{entry.evaluation.feedback}</p>
            <p className="review-tip">Tip: {entry.evaluation.improvementTip}</p>
          </div>
        ))}

        <button className="primary-btn" onClick={restart}>Practice again</button>
      </div>
    </div>
  )
}