import { useEffect, useRef, useState } from "react"
import Header from "../../common/components/Header"
import Stepper from "./components/Stepper"
import RoleStep from "./components/RoleStep"
import ModeStep from "./components/ModeStep"
import StartStep from "./components/StartStep"
import ResumeCard from "./components/ResumeCard"
import FullAiNotice from "./components/FullAiNotice"
import { usePreference } from "../../common/hooks/usePreference"
import "./setup.css"
import "./setup.fit.css"

const STEP_TITLES = ["Choose your role", "Choose how to practice", "Review and start"]
const LAST_STEP = STEP_TITLES.length - 1

// Decorative "voice" bars on the left. Heights are percentages of the bar area.
const BARS = [30, 55, 80, 45, 95, 60, 35, 75, 50, 25, 65, 40]
const CHIPS = ["STAR checks", "Voice", "Follow-ups"]

const isBool = (v) => typeof v === "boolean"

// The free-tier warning shows at most once per page load, even if the user returns to this screen.
let noticeShownThisSession = false

// setup: the `setup` object from useInterview().
// Two sections on wide screens: the pitch on the left, the three-step form on the right.
// On narrow screens the pitch shrinks to a headline above the form (or disappears on short screens).
export default function SetupScreen({ setup, onHistory }) {
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0) // furthest step visited, so the stepper can jump back and forth
  const headingRef = useRef(null)
  const movedByUser = useRef(false)

  // The free-tier warning. aiNotice is null (closed), "toggle" (Full AI Mode was just switched on)
  // or "start" (the user pressed Start while Full AI Mode is on).
  const [hideNotice, setHideNotice] = usePreference("interview-ai-hide-full-notice", false, isBool)
  const [aiNotice, setAiNotice] = useState(null)

  const needsNotice = !hideNotice && !noticeShownThisSession

  const go = (next) => {
    if (setup.starting || next < 0 || next > LAST_STEP) return
    if (next > 0 && !setup.roleReady) return // a custom role needs a name before moving on
    movedByUser.current = true
    setStep(next)
    setReached((r) => Math.max(r, next))
  }

  // Switching Full AI Mode ON asks first. Switching it off never does.
  const handleAiMode = (next) => {
    if (next === "full" && needsNotice) {
      setAiNotice("toggle")
      return
    }
    setup.setAiMode(next)
  }

  // Covers a custom role (always Full AI) and a Full AI choice remembered from last time.
  const handleStart = () => {
    if (setup.aiMode === "full" && needsNotice) {
      setAiNotice("start")
      return
    }
    setup.start()
  }

  const closeNotice = () => setAiNotice(null)

  const acceptNotice = (dontShowAgain) => {
    const kind = aiNotice
    if (dontShowAgain) setHideNotice(true)
    noticeShownThisSession = true
    setAiNotice(null)
    if (kind === "toggle") setup.setAiMode("full")
    else setup.start()
  }

  // The quiet button: back out without turning anything on.
  const declineNotice = () => {
    // A preset role can fall back to Practice Mode. A custom role can't, so it just closes.
    if (aiNotice === "start" && !setup.requiresFullAi) setup.setAiMode("practice")
    setAiNotice(null)
  }

  // After the user moves between steps, put focus on the new step's heading so screen readers
  // announce it. Skipped on first render, where the page heading already receives focus.
  useEffect(() => {
    if (!movedByUser.current) return
    movedByUser.current = false
    headingRef.current?.focus()
  }, [step])

  // ModeStep reads setup.setAiMode, so it gets a copy whose setter asks for confirmation first.
  const modeStepSetup = { ...setup, setAiMode: handleAiMode }

  let secondaryLabel = "Stay in Practice Mode"
  if (aiNotice === "start") secondaryLabel = setup.requiresFullAi ? "Go back" : "Use Practice Mode"

  return (
    <div className="page page--setup">
      <Header onHistory={onHistory} />

      <main className="setup-split">
        <section className="setup-hero" aria-label="About AI Interview Coach">
          <h1 tabIndex={-1} data-screen-heading>
            Practice out loud.
            <br />
            Get real feedback.
          </h1>
          <p className="hero-sub">Scored on content, clarity and confidence.</p>

          <div className="wave" aria-hidden="true">
            {BARS.map((h, i) => (
              <span key={i} style={{ "--h": `${h}%`, "--d": `${(i * 0.12).toFixed(2)}s` }} />
            ))}
          </div>

          <ul className="hero-chips" aria-label="Features">
            {CHIPS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

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
            {step === 1 && <ModeStep setup={modeStepSetup} />}
            {step === 2 && <StartStep setup={setup} />}
          </div>

          <div className="step-nav">
            {step > 0 && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => go(step - 1)}
                disabled={setup.starting}
              >
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
                onClick={handleStart}
                disabled={setup.starting || !setup.roleReady || setup.customRoleBlocked}
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
      </main>

      {aiNotice && (
        <FullAiNotice
          continueLabel={aiNotice === "start" ? "Start interview" : "Turn on Full AI"}
          secondaryLabel={secondaryLabel}
          onContinue={acceptNotice}
          onSecondary={declineNotice}
          onClose={closeNotice}
        />
      )}
    </div>
  )
}