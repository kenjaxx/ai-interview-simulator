import { useState, useRef, useCallback, useEffect } from "react"
import { countFillers } from "../lib/fillers"

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function joinText(a, b) {
  return [a, b].filter(Boolean).join(" ").trim()
}

// Detach handlers first so a retired recognizer can never fire late events into a newer session.
function retire(recognition) {
  if (!recognition) return
  recognition.onresult = null
  recognition.onend = null
  recognition.onerror = null
  try {
    recognition.abort()
  } catch {
    /* already stopped */
  }
}

// Safety backstop only: fires if the mic is left open with no speech at all for a long stretch.
// The user normally finishes explicitly via finishAnswer().
const SILENCE_BACKSTOP_MS = 30000
// If the browser never delivers `onend` after stop(), finalize anyway after this long.
const STOP_FALLBACK_MS = 2000
// Guards against a restart loop when the browser ends recognition instantly, over and over.
const MAX_RAPID_RESTARTS = 5
const RAPID_RESTART_WINDOW_MS = 1000
// Very short answers would produce absurd WPM (8 words in 0.5s = 960), so never divide by less than this.
const MIN_SPEAKING_SEC = 2

// startListening({ promptShownAt, lang, onFinal, onEmpty, onError })
//   onFinal(text, { wpm, fillerCount, responseDelaySec }) - user finished with a non-empty answer
//   onEmpty()                                            - user finished but nothing was captured
//   onError(message)                                     - mic blocked, unsupported, repeated failures
//
// The live transcript is NOT React state here. Interim results arrive many times a second, and
// putting them in state would re-render whichever component calls this hook. Instead it is exposed
// as a tiny external store: subscribeTranscript / getTranscript, to be read with useSyncExternalStore
// by a small component (see LiveTranscript).
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const fallbackTimerRef = useRef(null)
  const startTimeRef = useRef(null) // when the first words arrived
  const lastResultAtRef = useRef(null) // when the transcript last actually changed
  const promptShownAtRef = useRef(null)
  const sessionIdRef = useRef(0) // guards against stale/late events from old sessions
  const langRef = useRef("en-US")
  const onFinalRef = useRef(null)
  const onEmptyRef = useRef(null)
  const onErrorRef = useRef(null)

  // The transcript lives in refs (not only state) so finishing never depends on a state updater.
  // Chrome can end recognition on its own; each restart begins a fresh results list, so text from
  // earlier instances is kept in committedTextRef and the live instance's text in currentTextRef.
  const committedTextRef = useRef("")
  const currentTextRef = useRef("")
  const finishingRef = useRef(false) // true once the user (or the backstop) asked to stop
  const lastLaunchRef = useRef(0)
  const rapidEndsRef = useRef(0)

  // ---------- live transcript as an external store ----------
  const transcriptRef = useRef("")
  const transcriptListenersRef = useRef(new Set())

  const setTranscript = useCallback((text) => {
    if (transcriptRef.current === text) return
    transcriptRef.current = text
    transcriptListenersRef.current.forEach((listener) => listener())
  }, [])

  const subscribeTranscript = useCallback((listener) => {
    transcriptListenersRef.current.add(listener)
    return () => {
      transcriptListenersRef.current.delete(listener)
    }
  }, [])

  const getTranscript = useCallback(() => transcriptRef.current, [])

  const clearTimers = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    clearTimeout(fallbackTimerRef.current)
  }, [])

  // Ends the session and reports the result exactly once.
  const finalize = useCallback(
    (sessionId) => {
      if (sessionIdRef.current !== sessionId) return
      clearTimers()
      retire(recognitionRef.current)
      recognitionRef.current = null
      sessionIdRef.current++ // anything else from this session is now ignored
      setIsListening(false)

      const text = joinText(committedTextRef.current, currentTextRef.current)

      if (!text) {
        onEmptyRef.current?.()
        return
      }

      // Speaking time runs from the first words to the LAST time the transcript changed, so the
      // pause between finishing the answer and clicking "done" doesn't drag WPM down.
      const speakingSec =
        startTimeRef.current && lastResultAtRef.current
          ? (lastResultAtRef.current - startTimeRef.current) / 1000
          : 0
      const wordCount = text.split(/\s+/).filter(Boolean).length
      const wpm = Math.round((wordCount / Math.max(speakingSec, MIN_SPEAKING_SEC)) * 60)
      const fillerCount = countFillers(text)
      const responseDelaySec = startTimeRef.current
        ? Math.round(((startTimeRef.current - promptShownAtRef.current) / 1000) * 10) / 10
        : 0

      onFinalRef.current?.(text, { wpm, fillerCount, responseDelaySec })
    },
    [clearTimers]
  )

  // Ends the session without submitting anything and reports an error message.
  const fail = useCallback(
    (sessionId, message) => {
      if (sessionIdRef.current !== sessionId) return
      clearTimers()
      retire(recognitionRef.current)
      recognitionRef.current = null
      sessionIdRef.current++
      setIsListening(false)
      onErrorRef.current?.(message)
    },
    [clearTimers]
  )

  // Asks the recognizer to stop; onend (or the fallback timer) then calls finalize.
  const requestStop = useCallback(
    (sessionId) => {
      if (sessionIdRef.current !== sessionId) return
      finishingRef.current = true
      clearTimeout(silenceTimerRef.current)
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = setTimeout(() => finalize(sessionId), STOP_FALLBACK_MS)
      try {
        recognitionRef.current?.stop()
      } catch {
        finalize(sessionId)
      }
    },
    [finalize]
  )

  const armBackstop = useCallback(
    (sessionId) => {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current === sessionId) requestStop(sessionId)
      }, SILENCE_BACKSTOP_MS)
    },
    [requestStop]
  )

  // Creates and starts one recognizer instance for the given session. Can be called again for the
  // same session to transparently restart after the browser ends recognition on its own.
  const launch = useCallback(
    function launchRecognizer(sessionId) {
      const SpeechRecognition = getSpeechRecognition()
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = langRef.current

      recognition.onresult = (event) => {
        if (sessionIdRef.current !== sessionId) return

        let fullText = ""
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript + " "
        }
        fullText = fullText.trim()

        // Only treat this as "the user just spoke" if the text actually changed. Chrome can re-fire
        // results (e.g. when marking words final) without any new speech.
        if (fullText !== currentTextRef.current) {
          const now = Date.now()
          if (!startTimeRef.current) startTimeRef.current = now
          lastResultAtRef.current = now
        }

        currentTextRef.current = fullText
        setTranscript(joinText(committedTextRef.current, currentTextRef.current))

        if (!finishingRef.current) armBackstop(sessionId)
      }

      recognition.onerror = (event) => {
        if (sessionIdRef.current !== sessionId) return
        // "no-speech" fires constantly during normal pauses and "aborted" is our own doing.
        if (event.error === "no-speech" || event.error === "aborted") return

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          fail(
            sessionId,
            "Microphone access is blocked. Allow the mic in your browser settings, then try again."
          )
          return
        }
        if (event.error === "audio-capture") {
          fail(sessionId, "No microphone was found. Connect one and try again.")
          return
        }
        if (event.error === "network") {
          fail(sessionId, "Speech recognition lost its connection. Check your internet and try again.")
          return
        }
        // Anything else: log it and let onend decide whether to restart.
        console.error("Speech recognition error:", event.error)
      }

      recognition.onend = () => {
        if (sessionIdRef.current !== sessionId) return

        // The user (or the backstop) asked to stop, so this is the real end of the answer.
        if (finishingRef.current) {
          finalize(sessionId)
          return
        }

        // Unexpected end (Chrome stops recognition after pauses). Keep what we have and restart.
        committedTextRef.current = joinText(committedTextRef.current, currentTextRef.current)
        currentTextRef.current = ""

        if (Date.now() - lastLaunchRef.current < RAPID_RESTART_WINDOW_MS) {
          rapidEndsRef.current++
        } else {
          rapidEndsRef.current = 0
        }
        if (rapidEndsRef.current >= MAX_RAPID_RESTARTS) {
          fail(sessionId, "Speech recognition keeps stopping. Please try again, or use Chrome or Edge.")
          return
        }

        try {
          launchRecognizer(sessionId)
        } catch (err) {
          console.error("Couldn't restart speech recognition:", err)
          finalize(sessionId)
        }
      }

      lastLaunchRef.current = Date.now()
      recognitionRef.current = recognition
      recognition.start()
    },
    [armBackstop, fail, finalize, setTranscript]
  )

  const startListening = useCallback(
    ({ promptShownAt, onFinal, onEmpty, onError, lang } = {}) => {
      if (!getSpeechRecognition()) {
        onError?.("Speech recognition isn't supported in this browser. Try Chrome or Edge.")
        return
      }

      // Fully retire any previous session before starting a new one.
      clearTimers()
      retire(recognitionRef.current)
      recognitionRef.current = null

      langRef.current = lang || "en-US"
      const sessionId = ++sessionIdRef.current

      onFinalRef.current = onFinal || null
      onEmptyRef.current = onEmpty || null
      onErrorRef.current = onError || null
      promptShownAtRef.current = promptShownAt || Date.now()
      startTimeRef.current = null
      lastResultAtRef.current = null
      committedTextRef.current = ""
      currentTextRef.current = ""
      finishingRef.current = false
      rapidEndsRef.current = 0
      setTranscript("")

      try {
        launch(sessionId)
        setIsListening(true)
        armBackstop(sessionId)
      } catch (err) {
        console.error("Couldn't start speech recognition:", err)
        fail(sessionId, "Couldn't start the microphone. Please try again.")
      }
    },
    [armBackstop, clearTimers, fail, launch, setTranscript]
  )

  // Graceful stop - finalizes and submits the transcript (or reports an empty answer).
  // This is what the "I'm done" button calls.
  const finishAnswer = useCallback(() => {
    if (!recognitionRef.current) return
    requestStop(sessionIdRef.current)
  }, [requestStop])

  // Hard cancel - discards everything, does NOT submit. Used on restart/unmount.
  const stopListening = useCallback(() => {
    sessionIdRef.current++ // invalidate current session
    clearTimers()
    retire(recognitionRef.current)
    recognitionRef.current = null
    setIsListening(false)
  }, [clearTimers])

  // Never leave the mic recognizer running after the component goes away.
  useEffect(() => stopListening, [stopListening])

  return {
    isListening,
    subscribeTranscript,
    getTranscript,
    startListening,
    finishAnswer,
    stopListening,
  }
}
