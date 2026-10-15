import { useCallback, useEffect, useRef, useState } from "react"
import { useAudioLevel } from "../../../common/speech/useAudioLevel"

const AUTO_STOP_MS = 30_000 // don't leave the mic open on the setup screen
const HEARD_LEVEL = 0.12 // volume (0-1) that counts as "picking up sound"
const METER_GAIN = 2 // speech sits low on the raw 0-1 scale, so the bar scales it up

// "Test microphone": opens the mic and shows a live volume bar, so you can see it works before
// starting. The bar is written straight to the DOM from a requestAnimationFrame loop (no React
// state per frame), the same way the interview's orb reads the mic.
//   mic  { report } from useMicPermission(), so the result updates the permission notices
export default function MicTest({ mic }) {
  const { getLevel, acquireMic, releaseMic, getMicError } = useAudioLevel()
  const [phase, setPhase] = useState("idle") // "idle" | "starting" | "running" | "failed"
  const [heard, setHeard] = useState(false)
  const fillRef = useRef(null)

  const stop = useCallback(() => {
    releaseMic()
    setPhase("idle")
  }, [releaseMic])

  const start = async () => {
    setPhase("starting")
    setHeard(false)
    const ok = await acquireMic({ force: true })
    if (!ok) {
      const err = getMicError()
      if (err) {
        mic.report(err.name === "NotFoundError" || err.name === "OverconstrainedError" ? "missing" : "denied")
      }
      setPhase(err ? "failed" : "idle")
      return
    }
    mic.report("granted")
    setPhase("running")
  }

  // While running: update the bar every frame, notice the first real sound, and stop after a while.
  useEffect(() => {
    if (phase !== "running") return

    let rafId
    let heardSet = false
    const tick = () => {
      const level = getLevel()
      if (fillRef.current) {
        fillRef.current.style.width = `${Math.round(Math.min(1, level * METER_GAIN) * 100)}%`
      }
      if (!heardSet && level > HEARD_LEVEL) {
        heardSet = true
        setHeard(true)
      }
      rafId = requestAnimationFrame(tick)
    }
    tick()

    const timer = setTimeout(stop, AUTO_STOP_MS)
    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(timer)
    }
  }, [phase, getLevel, stop])

  let message = ""
  if (phase === "running") {
    message = heard
      ? "Looks good: your microphone is picking up sound."
      : "Say something and watch the bar move."
  } else if (phase === "failed") {
    message = "Couldn't open the microphone. Check the browser's permission and that a mic is connected."
  }

  return (
    <div className="mic-test">
      <div className="mic-test-row">
        <button
          type="button"
          className="secondary-btn"
          onClick={phase === "running" ? stop : start}
          disabled={phase === "starting"}
        >
          {phase === "starting" ? "Waiting for permission…" : phase === "running" ? "Stop test" : "Test microphone"}
        </button>
        {phase === "running" && (
          <div className="mic-meter" aria-hidden="true">
            <div className="mic-meter-fill" ref={fillRef} />
          </div>
        )}
      </div>
      {message && (
        <p className={`mode-notice ${phase === "failed" ? "mode-notice--warn" : ""}`} role="status">
          {message}
        </p>
      )}
    </div>
  )
}