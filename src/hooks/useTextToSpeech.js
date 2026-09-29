import { useState, useRef, useCallback, useEffect } from "react"

// Speaks text aloud and pulses a "word tick" value each time a word boundary fires,
// so the orb can visually pulse roughly in time with speech (no raw audio stream available for TTS)
export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [wordTick, setWordTick] = useState(0)

  const utteranceRef = useRef(null)
  // Each speak() call gets an id. stop() and any newer speak() bump it, so callbacks from
  // cancelled/replaced speech (the browser fires onend/onerror on cancel) are ignored
  // instead of, say, starting the microphone after the user already left the interview.
  const speakIdRef = useRef(0)

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis) {
      alert("Text-to-speech isn't supported in this browser.")
      onEnd?.()
      return
    }

    const id = ++speakIdRef.current

    // Cancel anything currently speaking before starting new speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    let finished = false
    const finish = () => {
      if (finished || speakIdRef.current !== id) return
      finished = true
      setIsSpeaking(false)
      onEnd?.()
    }

    utterance.onstart = () => {
      if (speakIdRef.current === id) setIsSpeaking(true)
    }

    utterance.onboundary = (event) => {
      if (speakIdRef.current !== id) return
      if (event.name === "word") {
        setWordTick((tick) => tick + 1)
      }
    }

    utterance.onend = finish

    utterance.onerror = (event) => {
      // "canceled"/"interrupted" are expected when we stop or replace speech on purpose.
      if (event.error !== "canceled" && event.error !== "interrupted") {
        console.error("TTS error:", event.error)
      }
      finish()
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [])

  const stop = useCallback(() => {
    speakIdRef.current++ // invalidate any pending callbacks
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  // Stop talking if the component goes away.
  useEffect(() => stop, [stop])

  return { isSpeaking, wordTick, speak, stop }
}