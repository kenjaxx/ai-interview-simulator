import { useRef, useCallback, useEffect } from "react"

// Manages one microphone stream for the whole interview and exposes a getLevel() function
// that reads the current volume (0 to 1) on demand.
//
// There is deliberately NO React state and NO animation loop in here. Whoever needs the level
// (the Orb) polls getLevel() from its own requestAnimationFrame loop and writes straight to the
// DOM, so mic volume never triggers a React re-render.
//
// acquireMic() is idempotent: call it as often as you like, the stream is only opened once.
// releaseMic() must be called when the interview ends.
export function useAudioLevel() {
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const dataRef = useRef(null)
  const pendingRef = useRef(null) // in-flight acquire, so concurrent calls share one getUserMedia
  const acquireIdRef = useRef(0) // bumped by acquire and release, so a late acquire can detect it was cancelled

  const acquireMic = useCallback(() => {
    // Already have a live stream: just make sure the context isn't suspended.
    if (streamRef.current) {
      audioContextRef.current?.resume?.().catch(() => {})
      return Promise.resolve(true)
    }
    if (pendingRef.current) return pendingRef.current

    const id = ++acquireIdRef.current

    const run = async () => {
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })

        // releaseMic() was called while we were waiting for permission: don't keep the stream.
        if (acquireIdRef.current !== id) {
          stream.getTracks().forEach((track) => track.stop())
          return false
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        const audioContext = new AudioContextClass()
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        streamRef.current = stream
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
        return true
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop())
        console.error("Microphone access failed:", err)
        return false
      }
    }

    const promise = run().finally(() => {
      if (pendingRef.current === promise) pendingRef.current = null
    })
    pendingRef.current = promise
    return promise
  }, [])

  // Current volume, roughly normalized to 0-1. Returns 0 when no stream is open.
  const getLevel = useCallback(() => {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (!analyser || !data) return 0

    analyser.getByteFrequencyData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    return Math.min(sum / data.length / 128, 1)
  }, [])

  const releaseMic = useCallback(() => {
    acquireIdRef.current++ // cancels any acquire that's still waiting on permission
    pendingRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    analyserRef.current = null
    dataRef.current = null

    const audioContext = audioContextRef.current
    audioContextRef.current = null
    audioContext?.close().catch(() => {})
  }, [])

  // Never leave the mic open after the component goes away.
  useEffect(() => releaseMic, [releaseMic])

  return { getLevel, acquireMic, releaseMic }
}