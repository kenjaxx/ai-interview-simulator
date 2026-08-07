import { useState, useRef, useCallback } from "react"

const FILLER_WORDS = ["um", "uh", "like", "you know", "so", "actually", "basically"]

function countFillers(text) {
  const lower = text.toLowerCase()
  return FILLER_WORDS.reduce((count, word) => {
    const matches = lower.match(new RegExp(`\\b${word}\\b`, "g"))
    return count + (matches ? matches.length : 0)
  }, 0)
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const startTimeRef = useRef(null)
  const promptShownAtRef = useRef(null)
  const onFinalRef = useRef(null)
  const sessionIdRef = useRef(0) // guards against stale/late events from old sessions

  const SILENCE_MS = 2200 // longer pause allowed before treating answer as finished

  const startListening = useCallback((onFinalTranscript, promptShownAt) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Speech recognition isn't supported in this browser. Try Chrome or Edge.")
      return
    }

    // Fully retire any previous session before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null
      recognitionRef.current.onend = null
      recognitionRef.current.onerror = null
      try { recognitionRef.current.abort() } catch {}
    }

    const thisSessionId = ++sessionIdRef.current
    onFinalRef.current = onFinalTranscript
    promptShownAtRef.current = promptShownAt || Date.now()
    startTimeRef.current = null
    setTranscript("")

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event) => {
      if (sessionIdRef.current !== thisSessionId) return // stale session, ignore
      if (!startTimeRef.current) startTimeRef.current = Date.now()

      let fullText = ""
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " "
      }
      setTranscript(fullText.trim())

      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current === thisSessionId) recognition.stop()
      }, SILENCE_MS)
    }

    recognition.onerror = (event) => {
      if (sessionIdRef.current !== thisSessionId) return
      console.error("Speech recognition error:", event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      if (sessionIdRef.current !== thisSessionId) return // stale session, ignore completely
      setIsListening(false)
      clearTimeout(silenceTimerRef.current)

      setTranscript((finalText) => {
        if (finalText && onFinalRef.current) {
          const elapsedSec = startTimeRef.current
            ? (Date.now() - startTimeRef.current) / 1000
            : 1
          const wordCount = finalText.split(/\s+/).filter(Boolean).length
          const wpm = Math.round((wordCount / Math.max(elapsedSec, 1)) * 60)
          const fillerCount = countFillers(finalText)
          const responseDelaySec = startTimeRef.current
            ? Math.round(((startTimeRef.current - promptShownAtRef.current) / 1000) * 10) / 10
            : 0

          onFinalRef.current(finalText, { wpm, fillerCount, responseDelaySec })
        }
        return finalText
      })
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    sessionIdRef.current++ // invalidate current session
    recognitionRef.current?.abort()
  }, [])

  return { isListening, transcript, startListening, stopListening }
}