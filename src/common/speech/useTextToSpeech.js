import { useState, useRef, useCallback, useEffect } from "react"
import { getInterviewer } from "../../lib/interviewers"
import { resolveVoice } from "../../lib/voices"

const IS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window

// Some voices (notably network voices in Chrome, like the Google ones) never fire `boundary` events.
// If none arrives shortly after speech starts, the avatar's mouth is pulsed on a timer at roughly
// speaking pace instead.
const BOUNDARY_WAIT_MS = 900
const FALLBACK_WPM = 160
const MIN_PULSE_INTERVAL_MS = 180
// Phones often report an empty voice list until a moment after load. Wait this long for it, so the
// first question isn't read in the phone's default voice.
const VOICES_WAIT_MS = 1000

// Speaks text aloud in the chosen interviewer's voice. Word boundaries are broadcast through
// subscribeWord() instead of React state, so the avatar's mouth can move roughly in time with speech
// without re-rendering the whole app on every word (no raw audio stream is available for TTS).
// When speech isn't supported, speak() finishes immediately and the caller shows the text instead.
//
// options: { interviewerId } - read at speak() time, so changing it never recreates speak().
//
// Voice choice: the interviewer's own voice if this browser has it, otherwise the closest stand-in
// (see resolveVoice in voices.js). A stand-in gets the interviewer's pitch so they still differ.
export function useTextToSpeech({ interviewerId } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState(() => (IS_SUPPORTED ? window.speechSynthesis.getVoices() : []))

  const utteranceRef = useRef(null)
  const wordListenersRef = useRef(new Set())
  // Each speak() call gets an id. stop() and any newer speak() bump it, so callbacks from
  // cancelled/replaced speech are ignored instead of, say, starting the microphone after the user
  // already left the interview.
  const speakIdRef = useRef(0)
  const interviewerIdRef = useRef(interviewerId)

  useEffect(() => {
    interviewerIdRef.current = interviewerId
  }, [interviewerId])

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

  const speak = useCallback((text, onEnd) => {
    if (!IS_SUPPORTED) {
      onEnd?.()
      return
    }

    const synth = window.speechSynthesis
    const id = ++speakIdRef.current
    const person = getInterviewer(interviewerIdRef.current)
    const rate = person.voice.rate ?? 1

    // Cancel anything currently speaking before starting new speech
    synth.cancel()

    const begin = () => {
      if (speakIdRef.current !== id) return // stopped or replaced while we waited for voices

      const utterance = new SpeechSynthesisUtterance(text)
      const { voice: chosen, match } = resolveVoice(person, synth.getVoices())

      if (chosen) {
        utterance.voice = chosen
        utterance.lang = chosen.lang
      } else {
        utterance.lang = person.voice.lang
      }
      utterance.rate = rate
      utterance.volume = 1
      // Only a stand-in voice is pitch-shifted, so Daniel and Alex don't sound the same on a phone.
      utterance.pitch = match === "preferred" ? 1 : (person.voice.pitch ?? 1)

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
          const intervalMs = Math.max(MIN_PULSE_INTERVAL_MS, 60000 / (FALLBACK_WPM * rate))
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
          stopFallback()
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
      synth.speak(utterance)
    }

    if (synth.getVoices().length > 0) {
      begin()
      return
    }

    // The voice list isn't ready yet (common on phones): wait for it, but never for long.
    let started = false
    let timer = null
    const go = () => {
      if (started) return
      started = true
      clearTimeout(timer)
      synth.removeEventListener?.("voiceschanged", go)
      begin()
    }
    timer = setTimeout(go, VOICES_WAIT_MS)
    synth.addEventListener?.("voiceschanged", go)
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