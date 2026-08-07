import { useState, useCallback, useRef } from "react"
import Orb from "./components/Orb"
import { useSpeechRecognition } from "./hooks/useSpeechRecognition"
import { useTextToSpeech } from "./hooks/useTextToSpeech"
import { useAudioLevel } from "./hooks/useAudioLevel"
import { generateNextQuestion, evaluateAnswer } from "./lib/gemini"
import "./App.css"

const QUESTION_COUNT = 6

export default function App() {
  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary"
  const [role, setRole] = useState("Frontend Developer")
  const [seniority, setSeniority] = useState("Mid-level")

  const [orbState, setOrbState] = useState("idle")
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [session, setSession] = useState([]) // [{ question, answer, metrics, evaluation }]

  const promptShownAtRef = useRef(null)

  const { isListening, transcript, startListening } = useSpeechRecognition()
  const { speak } = useTextToSpeech()
  const { level: micLevel, startTracking, stopTracking } = useAudioLevel()

  const askQuestion = useCallback(async (history) => {
    setOrbState("thinking")
    const question = await generateNextQuestion({ role, seniority, history })
    setCurrentQuestion(question)

    setOrbState("speaking")
    promptShownAtRef.current = Date.now()

    speak(question, () => {
      setOrbState("listening")
      startTracking()
      startListening(handleAnswer, promptShownAtRef.current)
    })
  }, [role, seniority, speak, startTracking, startListening])

  const handleAnswer = useCallback(async (answerText, metrics) => {
    stopTracking()
    setOrbState("thinking")

    const evaluation = await evaluateAnswer({
      question: currentQuestion,
      answer: answerText,
      metrics,
    })

    const entry = { question: currentQuestion, answer: answerText, metrics, evaluation }

    setSession((prev) => {
      const updated = [...prev, entry]

      if (updated.length >= QUESTION_COUNT) {
        setScreen("summary")
        setOrbState("idle")
      } else {
        askQuestion(updated.map(e => ({ question: e.question, answer: e.answer })))
      }

      return updated
    })
  }, [currentQuestion, stopTracking, askQuestion])

  const startInterview = () => {
    setSession([])
    setScreen("interview")
    askQuestion([])
  }

  const restart = () => {
    setScreen("setup")
    setSession([])
    setCurrentQuestion("")
    setOrbState("idle")
  }

  if (screen === "setup") {
    return (
      <div className="app-shell centered">
        <div className="setup-card">
          <h1>AI interview simulator</h1>
          <p className="subtitle">Practice out loud. Get real feedback.</p>

          <label>
            Target role
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer" />
          </label>

          <label>
            Seniority
            <select value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option>Entry-level</option>
              <option>Mid-level</option>
              <option>Senior</option>
            </select>
          </label>

          <button className="primary-btn" onClick={startInterview}>Start interview</button>
        </div>
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <div className="app-shell centered">
        <Orb state={orbState} micLevel={micLevel} />
        <p className="question-text">{currentQuestion}</p>
        {isListening && <p className="live-transcript">{transcript}</p>}
        <p className="progress-label">Question {session.length + 1} of {QUESTION_COUNT}</p>
      </div>
    )
  }

  // summary screen
  const avg = (key) => Math.round(
    session.reduce((sum, e) => sum + e.evaluation[key], 0) / session.length
  )

  return (
    <div className="app-shell">
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
  )
}