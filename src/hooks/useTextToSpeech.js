import { useState, useRef, useCallback, useEffect } from "react"

const IS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window

// Speaks text aloud. Word boundaries are broadcast through subscribeWord() instead of React state,
// so the orb can pulse roughly in time with speech without re-rendering the whole app on every word
// (no raw audio stream is available for TTS).
// When speech isn't supported, speak() finishes immediately and the caller shows the text instead.
export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const utteranceRef = useRef(null)
  const wordListenersRef = useRef(new Set())
  // Each speak() call gets an id. stop() and any newer speak() bump it, so callbacks from
  // cancelled/replaced speech (the browser fires onend/onerror on cancel) are ignored
  // instead of, say, starting the microphone after the user already left the interview.
  const speakIdRef = useRef(0)

  // subscribeWord(fn) -> unsubscribe. fn is called on every spoken word boundary.
  const subscribeWord = useCallback((fn) => {
    wordListenersRef.current.add(fn)
    return () => {
      wordListenersRef.current.delete(fn)
    }
  }, [])

  const speak = useCallback((text, onEnd) => {
    if (!IS_SUPPORTED) {
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
        wordListenersRef.current.forEach((fn) => fn())
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
    if (IS_SUPPORTED) window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  // Stop talking if the component goes away.
  useEffect(() => stop, [stop])

  return { isSpeaking, isSupported: IS_SUPPORTED, subscribeWord, speak, stop }
}