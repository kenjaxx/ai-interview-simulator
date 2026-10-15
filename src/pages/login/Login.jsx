import { useEffect, useId, useState } from "react"
import { useAuth } from "../../app/context/AuthContext"
import { INTERVIEWERS } from "../../lib/interviewers"
import InterviewerFace from "../../common/avatar/InterviewerFace"
import ThemeToggle from "../../common/components/ThemeToggle"
import { GoogleIcon } from "./components/ProviderIcons"
import "./Login.css"
import "./login.fit.css"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6 // Firebase's own minimum
const RESEND_COOLDOWN_SEC = 30
const QUESTION_EVERY_MS = 4500

const COPY = {
  signin: { title: "Welcome back", sub: "Sign in to start your next practice interview.", submit: "Sign in", busy: "Signing in…" },
  signup: { title: "Create account", sub: "Free to start. Practice Mode is unlimited.", submit: "Create account", busy: "Creating account…" },
  reset: { title: "Reset password", sub: "Enter your email and we'll send you a reset link.", submit: "Send reset link", busy: "Sending…" },
  verify: { title: "Check your email", sub: "", submit: "I've verified my email", busy: "Checking…" },
}

// A taste of what the interview feels like. Decorative only.
const QUESTIONS = [
  "Tell me about a project you're proud of.",
  "How do you handle feedback you disagree with?",
  "Walk me through how you prioritize tasks.",
  "Describe a mistake you made and what you did next.",
]

const STEPS = [
  { n: "1", label: "Pick a role" },
  { n: "2", label: "Answer out loud" },
  { n: "3", label: "Get feedback" },
]

// ---------- decorative pieces (the whole art panel is aria-hidden) ----------

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
}

function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  )
}

// The glass orb: halo, orbit ring, floor reflection, the sphere itself, and sparkles.
// All animation is CSS, so nothing here ever re-renders.
function Orb() {
  return (
    <div className="login-orb-stage">
      <div className="login-orb-glow" />
      <div className="login-orb-ring" />
      <div className="login-orb-shadow" />
      <div className="login-orb">
        <div className="login-orb-body" />
        <div className="login-orb-sheen" />
        <div className="login-orb-hi" />
        <div className="login-orb-rim" />
      </div>
      <i className="login-spark login-spark--1" />
      <i className="login-spark login-spark--2" />
      <i className="login-spark login-spark--3" />
      <i className="login-spark login-spark--4" />
    </div>
  )
}

// A small card that crossfades between "speaking" (mic + sound bars) and "typing" (keyboard + text
// being typed). Pure CSS, so it costs nothing.
function VoiceTypeCard() {
  return (
    <div className="login-vt">
      <div className="login-vt-layer login-vt-layer--voice">
        <span className="login-vt-icon">
          <MicIcon />
        </span>
        <span className="login-vt-body">
          <b>Speaking</b>
          <span className="login-vt-eq">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
      <div className="login-vt-layer login-vt-layer--type">
        <span className="login-vt-icon">
          <KeyboardIcon />
        </span>
        <span className="login-vt-body">
          <b>Typing</b>
          <span className="login-vt-typed">
            <span>I led the migration</span>
            <i className="login-vt-caret" />
          </span>
        </span>
      </div>
    </div>
  )
}

// Cycles through sample questions. Its own state, so the ticking never re-renders the form.
function QuestionCard() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => setIndex((n) => (n + 1) % QUESTIONS.length), QUESTION_EVERY_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="login-qcard">
      <p className="login-qlabel">
        <span className="login-qdot" />
        Your interviewer asks
      </p>
      <p className="login-qtext" key={index}>
        {QUESTIONS[index]}
      </p>
    </div>
  )
}

// busy: which action is running, so every control can lock while one is in flight.
//   null | "email" | "google" | "resend"
export default function Login() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerification,
    checkVerification,
    signOutUser,
    pendingUser,
    authError,
    clearAuthError,
  } = useAuth()

  const [view, setView] = useState("signin") // "signin" | "signup" | "reset"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(null)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [cooldown, setCooldown] = useState(0)

  const headingId = useId()
  const nameId = useId()
  const emailId = useId()
  const passwordId = useId()

  // A signed-in but unverified email account always lands on the verify screen.
  const mode = pendingUser ? "verify" : view
  const copy = COPY[mode]
  const error = formError || authError
  const locked = busy !== null

  // Counts down the "Resend" button.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Arriving on the verify screen right after sign-up: the email was just sent.
  useEffect(() => {
    if (pendingUser) setCooldown(RESEND_COOLDOWN_SEC)
  }, [pendingUser])

  const switchView = (next) => {
    setView(next)
    setFormError(null)
    setNotice(null)
    setShowPassword(false)
    clearAuthError()
  }

  const run = async (key, action) => {
    setBusy(key)
    setFormError(null)
    setNotice(null)
    try {
      return await action()
    } finally {
      setBusy(null)
    }
  }

  const fail = (message) => {
    clearAuthError()
    setNotice(null)
    setFormError(message)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (locked) return

    if (mode === "verify") {
      const ok = await run("email", checkVerification)
      if (!ok && !authError) fail("Not verified yet. Open the link in your email, then try again.")
      return // on success the auth listener swaps this screen out
    }

    const cleanEmail = email.trim()
    if (!EMAIL_RE.test(cleanEmail)) return fail("Enter a valid email address.")

    if (mode === "reset") {
      const ok = await run("email", () => sendPasswordReset(cleanEmail))
      if (ok) setNotice(`If an account exists for ${cleanEmail}, a reset link is on its way. Check your spam folder too.`)
      return
    }

    if (!password) return fail("Enter your password.")
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      return fail(`Choose a password with at least ${MIN_PASSWORD} characters.`)
    }

    if (mode === "signup") {
      await run("email", () => signUpWithEmail({ name: name.trim(), email: cleanEmail, password }))
    } else {
      await run("email", () => signInWithEmail(cleanEmail, password))
    }
    // On success the auth listener swaps this screen out (or shows the verify screen).
  }

  const onResend = async () => {
    if (locked || cooldown > 0) return
    const ok = await run("resend", resendVerification)
    if (ok) {
      setCooldown(RESEND_COOLDOWN_SEC)
      setNotice(`We sent another link to ${pendingUser?.email}.`)
    }
  }

  return (
    <main className="login-stage">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <div className="login-shell">
        {/* ---------- art panel (decorative) ---------- */}
        <section className="login-art" aria-hidden="true">
          <h2 className="login-art-title">
            SMART
            <br />
            INTERVIEW
          </h2>
          <p className="login-art-kicker">ASSISTANT</p>

          <div className="login-orb-zone">
            <Orb />
            <VoiceTypeCard />
          </div>

          <QuestionCard />

          <div className="login-art-copy">
            <p className="login-art-heading">Smart Interview Assistance</p>
            <ol className="login-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span>{s.n}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- form panel ---------- */}
        <section className="login-side">
          <form className="login-card" onSubmit={onSubmit} noValidate aria-labelledby={headingId}>
            <span className="login-logo" aria-hidden="true" />
            <h1 id={headingId} data-screen-heading tabIndex={-1}>
              {copy.title}
            </h1>

            {mode === "verify" ? (
              <p className="login-sub">
                We sent a verification link to <strong>{pendingUser?.email}</strong>. Open it, then come back
                and press the button below.
              </p>
            ) : (
              <p className="login-sub">{copy.sub}</p>
            )}

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="login-notice" role="status">
                {notice}
              </p>
            )}

            {/* Each field: the input comes BEFORE its label, so CSS can float the label up. */}
            {mode === "signup" && (
              <div className="login-field">
                <input
                  id={nameId}
                  className="login-input"
                  type="text"
                  autoComplete="name"
                  placeholder=" "
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={locked}
                />
                <label htmlFor={nameId}>Name (optional)</label>
              </div>
            )}

            {mode !== "verify" && (
              <div className="login-field">
                <input
                  id={emailId}
                  className="login-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={locked}
                />
                <label htmlFor={emailId}>Email</label>
              </div>
            )}

            {(mode === "signin" || mode === "signup") && (
              <div className="login-field">
                <input
                  id={passwordId}
                  className="login-input login-input--password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={locked}
                />
                <label htmlFor={passwordId}>
                  {mode === "signup" ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
                </label>
                <button
                  type="button"
                  className="login-show"
                  aria-pressed={showPassword}
                  aria-controls={passwordId}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            )}

            {mode === "signin" && (
              <button
                type="button"
                className="login-link login-forgot"
                onClick={() => switchView("reset")}
                disabled={locked}
              >
                Forgot password?
              </button>
            )}

            <button type="submit" className="login-submit" disabled={locked}>
              {busy === "email" ? copy.busy : copy.submit}
            </button>

            {mode === "verify" && (
              <div className="login-verify-actions">
                <button
                  type="button"
                  className="login-link"
                  onClick={onResend}
                  disabled={locked || cooldown > 0}
                >
                  {busy === "resend"
                    ? "Sending…"
                    : cooldown > 0
                      ? `Resend email in ${cooldown}s`
                      : "Resend email"}
                </button>
                <button type="button" className="login-link" onClick={signOutUser} disabled={locked}>
                  Use a different account
                </button>
              </div>
            )}

            {(mode === "signin" || mode === "signup") && (
              <>
                <div className="login-or" aria-hidden="true">
                  Or continue with
                </div>
                <button
                  type="button"
                  className="login-provider"
                  onClick={() => run("google", signInWithGoogle)}
                  disabled={locked}
                >
                  <GoogleIcon />
                  {busy === "google" ? "Opening…" : "Google"}
                </button>
              </>
            )}

            <p className="login-foot">
              {mode === "signin" && (
                <>
                  Don't have an account?{" "}
                  <button type="button" className="login-link login-link--strong" onClick={() => switchView("signup")}>
                    Sign up
                  </button>
                </>
              )}
              {mode === "signup" && (
                <>
                  Already have an account?{" "}
                  <button type="button" className="login-link login-link--strong" onClick={() => switchView("signin")}>
                    Sign in
                  </button>
                </>
              )}
              {mode === "reset" && (
                <button type="button" className="login-link login-link--strong" onClick={() => switchView("signin")}>
                  Back to sign in
                </button>
              )}
            </p>
          </form>

          <div className="login-strip">
            <div className="login-faces" aria-hidden="true">
              {INTERVIEWERS.map((p) => (
                <span key={p.id} className="login-face">
                  <InterviewerFace person={p} />
                </span>
              ))}
            </div>
            <div>
              <p className="login-strip-title">{INTERVIEWERS.length} AI interviewers</p>
              <p className="login-strip-sub">Free Practice Mode, unlimited</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}