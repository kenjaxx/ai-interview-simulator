import { useState, useRef, useCallback } from "react"

// Tracks real-time microphone volume (0 to 1) so the orb can react to the user's voice
export function useAudioLevel() {
  const [level, setLevel] = useState(0)

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  const startTracking = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
        setLevel(Math.min(avg / 128, 1)) // normalize roughly to 0-1
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (err) {
      console.error("Microphone access failed:", err)
    }
  }, [])

  const stopTracking = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioContextRef.current?.close()
    setLevel(0)
  }, [])

  return { level, startTracking, stopTracking }
}