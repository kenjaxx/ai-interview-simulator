import { useRef, useCallback, useEffect } from "react"
import { isMobileDevice } from "../../lib/support"

// Manages one microphone stream and exposes a getLevel() function that reads the current
// volume (0 to 1) on demand. Used for the interview's level meter and for the microphone test.
//
// There is deliberately NO React state and NO animation loop in here. Whoever needs the level
// polls getLevel() from its own requestAnimationFrame loop and writes straight to the DOM.
//
// On phones the stream is NOT opened during the interview: speech recognition already uses the mic,
// and a second stream on top of it triggers extra permission prompts, makes the phone lower the
// playback volume and can leave the recognizer without a mic. getLevel() simply returns 0 there.
// The setup screen's mic test passes { force: true } to open it on purpose.
//
// acquireMic() is idempotent: call it as often as you like, the stream is only opened once.
// It resolves to false if the mic wasn't opened; getMicError() then returns the reason
// (null if it was skipped or cancelled).
// releaseMic() must be called when the interview or test ends.
const SKIP_ON_MOBILE = isMobileDevice()

// Echo cancellation, noise suppression and auto gain put phones into "call" audio mode (quiet
// playback). The level meter doesn't need them.
const RAW_AUDIO = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
}

export function useAudioLevel() {
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const dataRef = useRef(null)
  const pendingRef = useRef(null)
  const acquireIdRef = useRef(0)
  const errorRef = useRef(null)

  const acquireMic = useCallback((options = {}) => {
    if (SKIP_ON_MOBILE && !options.force) return Promise.resolve(false)

    if (streamRef.current) {
      audioContextRef.current?.resume?.().catch(() => {})
      return Promise.resolve(true)
    }
    if (pendingRef.current) return pendingRef.current

    const id = ++acquireIdRef.current
    errorRef.current = null

    const run = async () => {
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia(RAW_AUDIO)

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
        if (acquireIdRef.current === id) errorRef.current = err
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

  const getMicError = useCallback(() => errorRef.current, [])

  const releaseMic = useCallback(() => {
    acquireIdRef.current++
    pendingRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    analyserRef.current = null
    dataRef.current = null

    const audioContext = audioContextRef.current
    audioContextRef.current = null
    audioContext?.close().catch(() => {})
  }, [])

  useEffect(() => releaseMic, [releaseMic])

  return { getLevel, acquireMic, releaseMic, getMicError }
}