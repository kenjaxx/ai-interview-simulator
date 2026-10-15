import { useEffect, useRef } from "react"
import { useAuth } from "../../../app/context/AuthContext"
import { Icon } from "./DockIcons"

// Relative height of each of the nine bars, so the meter doesn't look like a flat block.
const SHAPE = [0.45, 0.7, 0.9, 0.6, 1, 0.65, 0.85, 0.55, 0.4]

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// The mic level meter. While active it polls getLevel() every frame and writes the bar heights
// straight to the DOM, so mic volume never re-renders React (same approach as the avatar).
// On phones the mic stream isn't opened during the interview (see useAudioLevel), so the bars simply
// stay low there.
function MicBars({ active, getLevel }) {
  const ref = useRef(null)

  useEffect(() => {
    const bars = ref.current ? Array.from(ref.current.children) : []
    const set = (level) => {
      bars.forEach((bar, i) => {
        const h = Math.max(0.15, Math.min(1, level * SHAPE[i] * 1.8 + 0.12))
        bar.style.transform = `scaleY(${h})`
      })
    }

    if (!active || prefersReducedMotion()) {
      set(0)
      return
    }

    let rafId
    const tick = () => {
      set(getLevel ? getLevel() : 0)
      rafId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(rafId)
  }, [active, getLevel])

  return (
    <span className="you-bars" ref={ref} aria-hidden="true">
      {SHAPE.map((_, i) => (
        <i key={i} />
      ))}
    </span>
  )
}

// A small "you" tile: your picture, whether the mic is on, and a live volume meter.
export default function YouTile({ inputMode, isListening, getLevel }) {
  const { user } = useAuth()
  const name = String(user?.displayName || user?.email || "You").split(/[ @]/)[0] || "You"
  const voice = inputMode === "voice"
  const live = voice && isListening

  return (
    <section className={`you ${live ? "you--live" : ""}`} aria-label="You">
      <div className="you-avatar">
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        )}
        <span className="you-mic" aria-hidden="true">
          <Icon name={voice ? "mic" : "keyboard"} size={12} />
        </span>
      </div>

      <div className="you-meta">
        <p className="you-name">You · {name}</p>
        <p className="you-state">{live ? "Mic on" : voice ? "Mic ready" : "Typing"}</p>
      </div>

      <MicBars active={live} getLevel={getLevel} />
    </section>
  )
}