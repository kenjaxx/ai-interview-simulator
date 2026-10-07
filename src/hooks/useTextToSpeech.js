import { useState, useRef, useCallback, useEffect } from "react"
import { bestVoiceForAccent } from "../lib/speechOptions"

const IS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window

// Some voices (notably network voices in Chrome) never fire `boundary` events. If none arrives
// shortly after speech starts, the orb is pulsed on a timer at roughly speaking pace instead.
const BOUNDARY_WAIT_MS = 900
const FALLBACK_WPM = 160
const MIN_PULSE_INTERVAL_MS = 180

// Speaks text aloud. Word boundaries are broadcast through subscribeWord() instead of React state,
// so the orb can pulse roughly in time with speech without re-rendering the whole app on every word
// (no raw audio stream is available for TTS).
// When speech isn't supported, speak() finishes immediately and the caller shows the text instead.
//
// options: { voiceURI, rate, lang } - read at speak() time, so changing them never recreates speak().
//
// Voice choice: an explicitly chosen voice wins. Otherwise the best installed voice for the accent
// is picked here, instead of trusting the browser's own fallback (which often ignores the accent).
//
// speak(text, onEnd, override) - override can replace voiceURI / lang for one call (used by the
// accent preview buttons).
export function useTextToSpeech({ voiceURI = "", rate = 1, lang = "en-US" } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState(() => (IS_SUPPORTED ? window.speechSynthesis.getVoices() : []))

  const utteranceRef = useRef(null)
  const wordListenersRef = useRef(new Set())
  // Each speak() call gets an id. stop() and any newer speak() bump it, so callbacks from
  // cancelled/replaced speech (the browser fires onend/onerror on cancel) are ignored
  // instead of, say, starting the microphone after the user already left the interview.
  const speakIdRef = useRef(0)
  const settingsRef = useRef({ voiceURI, rate, lang })

  useEffect(() => {
    settingsRef.current = { voiceURI, rate, lang }
  }, [voiceURI, rate, lang])

  // Voices load asynchronously in most browsers.
  useEffect(() => {
    if (!IS_SUPPORTED) return
    const synth = window.speechSynthesis
    const update = () => setVoices(synth.getVoices())
    update()
    synth.addEventListener?.("voiceschanged", update)
    return () => synth.removeEventListener?.("voiceschanged", update)
  }, [])

  // subscribeWord(fn) -> unsubscribe. fn is called on every spoken word (real or estimated).
  const subscribeWord = useCallback((fn) => {
    wordListenersRef.current.add(fn)
    return () => {
      wordListenersRef.current.delete(fn)
    }
  }, [])

  const speak = useCallback((text, onEnd, override = {}) => {
    if (!IS_SUPPORTED) {
      onEnd?.()
      return
    }

    const id = ++speakIdRef.current
    const settings = { ...settingsRef.current, ...override }

    // Cancel anything currently speaking before starting new speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const allVoices = window.speechSynthesis.getVoices()
    const chosen =
      (settings.voiceURI ? allVoices.find((v) => v.voiceURI === settings.voiceURI) : null) ||
      bestVoiceForAccent(allVoices, settings.lang)

    if (chosen) {
      utterance.voice = chosen
      utterance.lang = chosen.lang
    } else {
      utterance.lang = settings.lang
    }
    utterance.rate = settings.rate
    utterance.pitch = 1.0

    const notifyWord = () => wordListenersRef.current.forEach((fn) => fn())

    let boundarySeen = false
    let watchdog = null
    let pulseTimer = null
    const stopFallback = () => {
      clearTimeout(watchdog)
      clearInterval(pulseTimer)
    }

    let finished = false
    const finish = () => {
      stopFallback()
      if (finished || speakIdRef.current !== id) return
      finished = true
      setIsSpeaking(false)
      onEnd?.()
    }

    utterance.onstart = () => {
      if (speakIdRef.current !== id) return
      setIsSpeaking(true)

      watchdog = setTimeout(() => {
        if (boundarySeen || speakIdRef.current !== id) return
        const intervalMs = Math.max(MIN_PULSE_INTERVAL_MS, 60000 / (FALLBACK_WPM * settings.rate))
        pulseTimer = setInterval(() => {
          if (speakIdRef.current !== id) {
            clearInterval(pulseTimer)
            return
          }
          notifyWord()
        }, intervalMs)
      }, BOUNDARY_WAIT_MS)
    }

    utterance.onboundary = (event) => {
      if (speakIdRef.current !== id) return
      if (event.name === "word") {
        boundarySeen = true
        stopFallback() // real boundaries are flowing, so the timer isn't needed
        notifyWord()
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

  return { isSpeaking, isSupported: IS_SUPPORTED, subscribeWord, speak, stop, voices }
}