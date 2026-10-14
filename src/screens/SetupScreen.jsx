import { useEffect, useRef, useState } from "react"
import Header from "../components/Header"
import Stepper from "../components/setup/Stepper"
import RoleStep from "../components/setup/RoleStep"
import ModeStep from "../components/setup/ModeStep"
import StartStep from "../components/setup/StartStep"
import ResumeCard from "../components/setup/ResumeCard"
import "../components/setup/setup.css"

const STEP_TITLES = ["Choose your role", "Choose how to practice", "Review and start"]
const LAST_STEP = STEP_TITLES.length - 1

// setup: the `setup` object from useInterview().
// A three-step flow (Role -> Mode -> Start). Advanced options stay collapsed on the last step.
export default function SetupScreen({ setup, onHistory }) {
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0) // furthest step visited, so the stepper can jump back and forth
  const headingRef = useRef(null)
  const movedByUser = useRef(false)

  const go = (next) => {
    if (setup.starting || next < 0 || next > LAST_STEP) return
    if (next > 0 && !setup.roleReady) return // a custom role needs a name before moving on
    movedByUser.current = true
    setStep(next)
    setReached((r) => Math.max(r, next))
  }

  // After the user moves between steps, put focus on the new step's heading so screen readers
  // announce it. Skipped on first render, where the page heading already receives focus.
  useEffect(() => {
    if (!movedByUser.current) return
    movedByUser.current = false
    headingRef.current?.focus()
  }, [step])

  return (
    <div className="page">
      <Header onHistory={onHistory} />
      <header className="hero hero--compact">
        <p className="eyebrow">AI Interview Coach</p>
        <h1 tabIndex={-1} data-screen-heading>
          Practice out loud.
          <br />
          Get real feedback.
        </h1>
        <p className="hero-sub">
          A live, voice-driven mock interview. Answer out loud, and once you're done the AI scores your
          content, clarity, and confidence based on what you actually said.
        </p>
      </header>

      <div className="setup-card">
        <ResumeCard
          draft={setup.draft}
          onResume={setup.resumeDraft}
          onDiscard={setup.discardDraft}
          disabled={setup.starting}
        />

        {setup.notice && (
          <p className="setup-notice" role="status">
            {setup.notice}
          </p>
        )}

        <Stepper step={step} reached={reached} onJump={go} disabled={setup.starting} />

        <h2 className="step-heading" tabIndex={-1} ref={headingRef}>
          {STEP_TITLES[step]}
        </h2>

        <div className="step-body">
          {step === 0 && <RoleStep setup={setup} />}
          {step === 1 && <ModeStep setup={setup} />}
          {step === 2 && <StartStep setup={setup} />}
        </div>

        <div className="step-nav">
          {step > 0 && (
            <button type="button" className="secondary-btn" onClick={() => go(step - 1)} disabled={setup.starting}>
              Back
            </button>
          )}
          {step < LAST_STEP ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => go(step + 1)}
              disabled={step === 0 && !setup.roleReady}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={setup.start}
              disabled={setup.starting || !setup.roleReady}
            >
              {setup.starting ? "Preparing your questions…" : "Start interview"}
            </button>
          )}
        </div>

        {step === LAST_STEP && (
          <p className="setup-note">
            {setup.setupMode === "voice"
              ? `You'll need microphone access — ${setup.questionCount} questions, spoken answers.`
              : `${setup.questionCount} questions, typed answers.`}
          </p>
        )}
      </div>
    </div>
  )
}