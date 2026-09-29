import { useEffect, useRef } from "react"
import "./Orb.css"

// state: "idle" | "listening" | "thinking" | "speaking"
// getLevel: () => 0-1 mic volume, polled every frame while listening (no React state involved)
// wordTick: increments on each spoken word, drives pulsing while speaking
export default function Orb({ state, getLevel, wordTick = 0 }) {
  const orbRef = useRef(null)
  const speakPulseTimeout = useRef(null)

  // Listening: poll the mic level every frame and write the scale directly to the DOM.
  // The loop only runs while listening and is cancelled as soon as the state changes.
  useEffect(() => {
    if (state !== "listening") return

    let rafId
    const tick = () => {
      const level = getLevel ? getLevel() : 0
      if (orbRef.current) {
        orbRef.current.style.transform = `scale(${1 + Math.min(level, 1) * 0.35})`
      }
      rafId = requestAnimationFrame(tick)
    }
    tick()

    return () => cancelAnimationFrame(rafId)
  }, [state, getLevel])

  // Speaking: quick pulse on every word boundary from TTS
  useEffect(() => {
    if (state !== "speaking" || !orbRef.current) return
    orbRef.current.style.transform = "scale(1.18)"
    clearTimeout(speakPulseTimeout.current)
    speakPulseTimeout.current = setTimeout(() => {
      if (orbRef.current) orbRef.current.style.transform = "scale(1)"
    }, 140)
  }, [wordTick, state])

  // Leaving the speaking state: drop any pending pulse reset, and
  // reset the transform when going back to idle/thinking
  useEffect(() => {
    if (state !== "speaking") clearTimeout(speakPulseTimeout.current)
    if ((state === "idle" || state === "thinking") && orbRef.current) {
      orbRef.current.style.transform = "scale(1)"
    }
  }, [state])

  // Don't leave a timer running after unmount
  useEffect(() => () => clearTimeout(speakPulseTimeout.current), [])

  return (
    <div className="orb-wrap">
      <div ref={orbRef} className={`orb orb--${state}`} />
      <p className="orb-label">{labelFor(state)}</p>
    </div>
  )
}

function labelFor(state) {
  switch (state) {
    case "listening": return "Listening..."
    case "thinking": return "Thinking..."
    case "speaking": return "Speaking..."
    default: return "Ready"
  }
}