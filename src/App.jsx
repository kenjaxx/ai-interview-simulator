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
  if (err?.isQuotaError) {
    if (err.isDailyQuota) {
      return "You've hit today's free-tier request limit. This resets at midnight Pacific Time — check your real usage at ai.dev/rate-limit, or switch to Practice Mode for unlimited local scoring."
    }
    return err.retryAfterSeconds
      ? `Too many requests right now — try again in about ${err.retryAfterSeconds}s.`
      : "You've hit the AI request limit for now. Please wait a bit and try again."
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

  const [orbState, setOrbState] = useState("idle")
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
  const sessionModeRef = useRef("practice")

  const { isListening, transcript, startListening, finishAnswer, stopListening } = useSpeechRecognition()
  const { speak } = useTextToSpeech()
  const { level: micLevel, startTracking, stopTracking } = useAudioLevel()

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, aiMode)
  }, [aiMode])

  const presentQuestion = useCallback((question) => {
    setCurrentQuestion(question)
    currentQuestionRef.current = question
    setOrbState("speaking")
    promptShownAtRef.current = Date.now()

    speak(question, () => {
      setOrbState("listening")
      startTracking()
      startListening(handleAnswer, promptShownAtRef.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, startTracking, startListening])

  const runFinalScoring = useCallback(async () => {
    setAwaitingFinalScore(true)
    setOrbState("thinking")
    setError(null)

    try {
      const { evaluations, overallSummary } = await evaluateSession({
        role, seniority, qas: qasRef.current, mock: sessionModeRef.current === "practice",
      })

      const finalSession = qasRef.current.map((qa, i) => ({
        question: qa.question,
        answer: qa.answer,
        metrics: qa.metrics,
        evaluation: evaluations[i],
      }))

      setSession(finalSession)
      setOverallSummary(overallSummary || "")
      setScreen("summary")
      setOrbState("idle")
      setAwaitingFinalScore(false)
    } catch (err) {
      console.error("Failed to score the session:", err)
      setError(messageForError(err))
      setOrbState("error")
    }
  }, [role, seniority])

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

  const retryCurrentQuestion = () => {
    setError(null)
    if (awaitingFinalScore) {
      runFinalScoring()
    } else {
      presentQuestion(currentQuestionRef.current)
    }
  }

  const startInterview = () => {
    qasRef.current = []
    sessionModeRef.current = aiMode
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

  const restart = () => {
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
  }

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

          <Orb state={orbState === "error" ? "idle" : orbState} micLevel={micLevel} />

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