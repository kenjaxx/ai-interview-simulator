import { useState, useRef, useCallback } from "react"

// Speaks text aloud and pulses a "word tick" value each time a word boundary fires,
// so the orb can visually pulse roughly in time with speech (no raw audio stream available for TTS)
export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [wordTick, setWordTick] = useState(0)

  const utteranceRef = useRef(null)

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis) {
      alert("Text-to-speech isn't supported in this browser.")
      onEnd?.()
      return
    }

    // Cancel anything currently speaking before starting new speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onstart = () => setIsSpeaking(true)

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        setWordTick((tick) => tick + 1)
      }
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      onEnd?.()
    }

    utterance.onerror = (event) => {
      console.error("TTS error:", event.error)
      setIsSpeaking(false)
      onEnd?.()
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  return { isSpeaking, wordTick, speak, stop }
}