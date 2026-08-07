import { useState, useCallback, useRef } from "react"
import Orb from "./components/Orb"
import { useSpeechRecognition } from "./hooks/useSpeechRecognition"
import { useTextToSpeech } from "./hooks/useTextToSpeech"
import { useAudioLevel } from "./hooks/useAudioLevel"
import { evaluateSession } from "./lib/gemini"
import { pickQuestions } from "./lib/questions"
import "./App.css"

const QUESTION_COUNT = 6

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

// Turns a caught error into a user-facing message. Understands the
// GeminiApiError shape (isQuotaError / retryAfterSeconds) thrown by lib/gemini.js
// and falls back to a generic message for anything else (network errors, etc).
function messageForError(err) {
  if (err?.isQuotaError) {
    // Google's `retryDelay` is a generic short backoff suggestion (often
    // ~30-60s) — it applies to per-minute rate limiting, NOT the daily cap.
    // For the daily free-tier limit it keeps returning a short delay even
    // though the real reset is hours away, so showing it as a countdown is
    // actively misleading. Only show it when we know it's NOT a daily-cap error.
    if (err.isDailyQuota) {
      return "You've hit today's free-tier request limit. This resets at midnight Pacific Time — check your real usage at ai.dev/rate-limit."
    }
    return err.retryAfterSeconds
      ? `Too many requests right now — try again in about ${err.retryAfterSeconds}s.`
      : "You've hit the AI request limit for now. Please wait a bit and try again."
  }
  return "Couldn't reach the interviewer AI. Check your connection and try again."
}

export default function App() {
  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary"
  const [role, setRole] = useState(ROLE_OPTIONS[0])
  const [seniority, setSeniority] = useState("Mid-level")

  const [orbState, setOrbState] = useState("idle")
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [answeredCount, setAnsweredCount] = useState(0) // drives the "Question X of N" label
  const [session, setSession] = useState([]) // filled in only once, after the batched evaluation
  const [overallSummary, setOverallSummary] = useState("")
  const [error, setError] = useState(null)
  // True once every question has been answered and we're waiting on / retrying
  // the single batched scoring call, rather than mid-interview.
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)

  const promptShownAtRef = useRef(null)
  // The full question list, picked once (no API call) when the interview starts.
  const questionsRef = useRef([])
  const currentQuestionRef = useRef("")
  // Every {question, answer, metrics} collected so far this interview — no
  // scoring happens until this is complete, so this ref IS the source of
  // truth during the interview (session state only fills in at the end).
  const qasRef = useRef([])

  const { isListening, transcript, startListening, finishAnswer, stopListening } = useSpeechRecognition()
  const { speak } = useTextToSpeech()
  const { level: micLevel, startTracking, stopTracking } = useAudioLevel()

  // Speaks the given question aloud, then starts listening for the answer.
  // Shared by every question and by question retries.
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

  // Sends everything collected so far to the AI in ONE request and builds
  // the final session + summary from the result. Also used to retry just
  // this last step if it fails, without re-asking any questions.
  const runFinalScoring = useCallback(async () => {
    setAwaitingFinalScore(true)
    setOrbState("thinking")
    setError(null)

    try {
      const { evaluations, overallSummary } = await evaluateSession({
        role, seniority, qas: qasRef.current,
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
      // Stay on the interview screen with awaitingFinalScore=true so the
      // retry button re-runs scoring instead of re-asking a question.
    }
  }, [role, seniority])

  const handleAnswer = useCallback((answerText, metrics) => {
    stopTracking()
    setError(null)

    const updated = [...qasRef.current, { question: currentQuestionRef.current, answer: answerText, metrics }]
    qasRef.current = updated
    setAnsweredCount(updated.length)

    if (updated.length >= QUESTION_COUNT) {
      // All questions answered — this is the one and only point that calls the AI.
      runFinalScoring()
    } else {
      // Next question comes straight from the local list — no API call.
      presentQuestion(questionsRef.current[updated.length])
    }
  }, [stopTracking, presentQuestion, runFinalScoring])

  const retryCurrentQuestion = () => {
    setError(null)
    if (awaitingFinalScore) {
      // We're past the last question — retry scoring, not the question.
      runFinalScoring()
    } else {
      // Re-asks the same question without touching the API at all.
      presentQuestion(currentQuestionRef.current)
    }
  }

  const startInterview = () => {
    qasRef.current = []
    setAnsweredCount(0)
    setSession([])
    setOverallSummary("")
    setError(null)
    setAwaitingFinalScore(false)
    setScreen("interview")

    // Pick the whole question list up front, locally — zero API calls here.
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

  if (screen === "setup") {
    return (
      <div className="page">
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

          <button className="primary-btn" onClick={startInterview}>Start interview</button>
          <p className="setup-note">You'll need microphone access — {QUESTION_COUNT} questions, spoken answers.</p>
        </div>
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <div className="page">
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
      <div className="summary-shell">
        <h1>Session summary</h1>

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