import { useId, useRef, useState } from "react"
import { useAuth } from "../context/AuthContext"
import LightScene from "./login/LightScene"
import { GoogleIcon, GithubIcon } from "./login/ProviderIcons"
import "./Login.css"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6 // Firebase's own minimum

const COPY = {
  signin: { title: "Sign in", sub: "Pick up where you left off.", submit: "Sign in", busy: "Signing in…" },
  signup: {
    title: "Create account",
    sub: "Free to start. Practice Mode is unlimited.",
    submit: "Create account",
    busy: "Creating account…",
  },
  reset: {
    title: "Reset password",
    sub: "Enter your email and we'll send you a reset link.",
    submit: "Send reset link",
    busy: "Sending…",
  },
}

// busy: which action is running, so every control can lock while one is in flight.
//   null | "email" | "google" | "github"
export default function Login() {
  const {
    signInWithGoogle,
    signInWithGithub,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    authError,
    clearAuthError,
  } = useAuth()

  const [mode, setMode] = useState("signin") // "signin" | "signup" | "reset"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(null)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState(null)

  const cardRef = useRef(null)
  const headingId = useId()
  const nameId = useId()
  const emailId = useId()
  const passwordId = useId()

  const copy = COPY[mode]
  const error = formError || authError
  const locked = busy !== null

  const switchMode = (next) => {
    setMode(next)
    setFormError(null)
    setNotice(null)
    setShowPassword(false)
    clearAuthError()
  }

  // Runs one action with the busy flag set. Resolves to whatever the action resolves to.
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

    const cleanEmail = email.trim()
    if (!EMAIL_RE.test(cleanEmail)) return fail("Enter a valid email address.")

    if (mode === "reset") {
      const ok = await run("email", () => sendPasswordReset(cleanEmail))
      if (ok) setNotice(`If an account exists for ${cleanEmail}, a reset link is on its way.`)
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
    // On success the auth listener swaps this screen out, so there is nothing more to do here.
  }

  return (
    <main className="login-stage">
      <LightScene cardRef={cardRef} />
      <p className="login-brand">AI Interview Coach</p>

      <div className="login-wrap">
        <form className="login-card" ref={cardRef} onSubmit={onSubmit} noValidate aria-labelledby={headingId}>
          <h1 id={headingId}>{copy.title}</h1>
          <p className="login-sub">{copy.sub}</p>

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

          {mode === "signup" && (
            <div className="login-field">
              <label htmlFor={nameId} className="sr-only">
                Name
              </label>
              <input
                id={nameId}
                className="login-input"
                type="text"
                autoComplete="name"
                placeholder="Your name (optional)"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={locked}
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor={emailId} className="sr-only">
              Email
            </label>
            <input
              id={emailId}
              className="login-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={locked}
            />
          </div>

          {mode !== "reset" && (
            <div className="login-field">
              <label htmlFor={passwordId} className="sr-only">
                Password
              </label>
              <input
                id={passwordId}
                className="login-input login-input--password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={locked}
              />
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
              onClick={() => switchMode("reset")}
              disabled={locked}
            >
              Forgot password
            </button>
          )}

          <button type="submit" className="login-submit" disabled={locked}>
            {busy === "email" ? copy.busy : copy.submit}
          </button>

          {mode !== "reset" && (
            <>
              <div className="login-or" aria-hidden="true">
                or
              </div>
              <div className="login-providers">
                <button
                  type="button"
                  className="login-provider"
                  onClick={() => run("google", signInWithGoogle)}
                  disabled={locked}
                >
                  <GoogleIcon />
                  {busy === "google" ? "Opening…" : "Google"}
                </button>
                <button
                  type="button"
                  className="login-provider"
                  onClick={() => run("github", signInWithGithub)}
                  disabled={locked}
                >
                  <GithubIcon />
                  {busy === "github" ? "Opening…" : "GitHub"}
                </button>
              </div>
            </>
          )}
        </form>

        <p className="login-foot">
          {mode === "signin" && (
            <>
              New here?{" "}
              <button type="button" className="login-link login-link--strong" onClick={() => switchMode("signup")}>
                Join now
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button type="button" className="login-link login-link--strong" onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </>
          )}
          {mode === "reset" && (
            <button type="button" className="login-link login-link--strong" onClick={() => switchMode("signin")}>
              Back to sign in
            </button>
          )}
        </p>
      </div>
    </main>
  )
}