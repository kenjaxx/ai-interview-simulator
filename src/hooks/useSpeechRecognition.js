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

  const SILENCE_MS = 1400 // pause length that signals "user is done talking"

  const startListening = useCallback((onFinalTranscript, promptShownAt) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Speech recognition isn't supported in this browser. Try Chrome or Edge.")
      return
    }

    onFinalRef.current = onFinalTranscript
    promptShownAtRef.current = promptShownAt || Date.now()
    startTimeRef.current = null
    setTranscript("")

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event) => {
      if (!startTimeRef.current) startTimeRef.current = Date.now()

      let fullText = ""
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + " "
      }
      setTranscript(fullText.trim())

      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
      }, SILENCE_MS)
    }

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
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
    recognitionRef.current?.stop()
  }, [])

  return { isListening, transcript, startListening, stopListening }
}