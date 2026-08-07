import { useEffect, useRef } from "react"
import "./Orb.css"

// state: "idle" | "listening" | "thinking" | "speaking"
// micLevel: 0-1, drives pulsing while listening
// wordTick: increments on each spoken word, drives pulsing while speaking
export default function Orb({ state, micLevel = 0, wordTick = 0 }) {
  const orbRef = useRef(null)
  const speakPulseTimeout = useRef(null)

  // Listening: scale reacts continuously to mic volume
  useEffect(() => {
    if (state !== "listening" || !orbRef.current) return
    const scale = 1 + Math.min(micLevel, 1) * 0.35
    orbRef.current.style.transform = `scale(${scale})`
  }, [micLevel, state])

  // Speaking: quick pulse on every word boundary from TTS
  useEffect(() => {
    if (state !== "speaking" || !orbRef.current) return
    orbRef.current.style.transform = "scale(1.18)"
    clearTimeout(speakPulseTimeout.current)
    speakPulseTimeout.current = setTimeout(() => {
      if (orbRef.current) orbRef.current.style.transform = "scale(1)"
    }, 140)
  }, [wordTick, state])

  // Reset transform when leaving listening/speaking states
  useEffect(() => {
    if ((state === "idle" || state === "thinking") && orbRef.current) {
      orbRef.current.style.transform = "scale(1)"
    }
  }, [state])

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