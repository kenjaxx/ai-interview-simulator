import { useState, useCallback, useRef } from "react"
import Orb from "./components/Orb"
import { useSpeechRecognition } from "./hooks/useSpeechRecognition"
import { useTextToSpeech } from "./hooks/useTextToSpeech"
import { useAudioLevel } from "./hooks/useAudioLevel"
import { generateNextQuestion, evaluateAnswer } from "./lib/gemini"
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

export default function App() {
  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary"
  const [role, setRole] = useState(ROLE_OPTIONS[0])
  const [seniority, setSeniority] = useState("Mid-level")

  const [orbState, setOrbState] = useState("idle")
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [session, setSession] = useState([]) // [{ question, answer, metrics, evaluation }]
  const [error, setError] = useState(null)

  const promptShownAtRef = useRef(null)
  // Mirrors `session` synchronously so async callbacks never work off a stale
  // closure and never need to put side effects inside a state updater.
  const sessionRef = useRef([])

  const { isListening, transcript, startListening, finishAnswer, stopListening } = useSpeechRecognition()
  const { speak } = useTextToSpeech()
  const { level: micLevel, startTracking, stopTracking } = useAudioLevel()

  const askQuestion = useCallback(async (history) => {
    setOrbState("thinking")
    setError(null)
    try {
      const question = await generateNextQuestion({ role, seniority, history })
      setCurrentQuestion(question)

      setOrbState("speaking")
      promptShownAtRef.current = Date.now()

      speak(question, () => {
        setOrbState("listening")
        startTracking()
        startListening(handleAnswer, promptShownAtRef.current)
      })
    } catch (err) {
      console.error("Failed to generate next question:", err)
      setError("Couldn't reach the interviewer AI. Check your connection and try again.")
      setOrbState("error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, seniority, speak, startTracking, startListening])

  const handleAnswer = useCallback(async (answerText, metrics) => {
    stopTracking()
    setOrbState("thinking")
    setError(null)

    try {
      const evaluation = await evaluateAnswer({
        question: currentQuestion,
        answer: answerText,
        metrics,
      })

      const entry = { question: currentQuestion, answer: answerText, metrics, evaluation }
      const updated = [...sessionRef.current, entry]
      sessionRef.current = updated
      setSession(updated)

      if (updated.length >= QUESTION_COUNT) {
        setScreen("summary")
        setOrbState("idle")
      } else {
        askQuestion(updated.map(e => ({ question: e.question, answer: e.answer })))
      }
    } catch (err) {
      console.error("Failed to evaluate answer:", err)
      setError("Something went wrong grading that answer. You can retry it below.")
      setOrbState("error")
    }
  }, [currentQuestion, stopTracking, askQuestion])

  const retryCurrentQuestion = () => {
    setError(null)
    setOrbState("speaking")
    promptShownAtRef.current = Date.now()
    speak(currentQuestion, () => {
      setOrbState("listening")
      startTracking()
      startListening(handleAnswer, promptShownAtRef.current)
    })
  }

  const startInterview = () => {
    sessionRef.current = []
    setSession([])
    setError(null)
    setScreen("interview")
    askQuestion([])
  }

  const restart = () => {
    stopListening()
    stopTracking()
    setScreen("setup")
    sessionRef.current = []
    setSession([])
    setCurrentQuestion("")
    setOrbState("idle")
    setError(null)
  }

  if (screen === "setup") {
    return (
      <div className="page">
        <header className="hero">
          <p className="eyebrow">AI Interview Coach</p>
          <h1>Practice out loud.<br />Get real feedback.</h1>
          <p className="hero-sub">
            A live, voice-driven mock interview that adapts its follow-up questions
            to what you actually say — then scores your content, clarity, and confidence.
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
          <p className="progress-label">Question {Math.min(session.length + 1, QUESTION_COUNT)} of {QUESTION_COUNT}</p>

          <Orb state={orbState === "error" ? "idle" : orbState} micLevel={micLevel} />

          <p className="question-text">{currentQuestion}</p>

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
                Retry this question
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