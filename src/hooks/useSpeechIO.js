import { useState, useCallback } from "react"
import { getSupport, voiceAvailable } from "../lib/support"
import { PREVIEW_TEXT } from "../lib/speechOptions"
import { useMicPermission } from "./useMicPermission"
import { useSpeechRecognition } from "./useSpeechRecognition"
import { useTextToSpeech } from "./useTextToSpeech"
import { useAudioLevel } from "./useAudioLevel"

// Bundles every browser speech feature (recognition, text-to-speech, mic permission, mic level)
// plus the voice previews used on the setup screen, so the interview hook just calls one thing.
export function useSpeechIO({ speechLang, ttsVoiceURI, ttsRate }) {
  const [support] = useState(getSupport)
  const mic = useMicPermission()
  const voiceOk = voiceAvailable(support, mic.state)

  const { isListening, subscribeTranscript, getTranscript, startListening, finishAnswer, stopListening } =
    useSpeechRecognition()

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: ttsSupported,
    subscribeWord,
    voices,
  } = useTextToSpeech({ voiceURI: ttsVoiceURI, rate: ttsRate, lang: speechLang })

  // The mic stream is opened once per interview (acquireMic is idempotent) and released at the end.
  // getLevel is polled by the Orb directly, so mic volume never causes a re-render.
  const { getLevel, acquireMic, releaseMic } = useAudioLevel()

  // Plays one accent's automatic voice, regardless of what is currently selected.
  const previewAccent = useCallback(
    (code, onEnd) => {
      speak(PREVIEW_TEXT, onEnd, { voiceURI: "", lang: code })
    },
    [speak]
  )

  // Plays the current accent, voice and speed settings together.
  const previewVoice = useCallback(
    (onEnd) => {
      speak(PREVIEW_TEXT, onEnd)
    },
    [speak]
  )

  return {
    support,
    mic,
    voiceOk,
    // recognition
    isListening,
    subscribeTranscript,
    getTranscript,
    startListening,
    finishAnswer,
    stopListening,
    // text-to-speech
    speak,
    stopSpeaking,
    isSpeaking,
    ttsSupported,
    subscribeWord,
    voices,
    // mic level
    getLevel,
    acquireMic,
    releaseMic,
    // setup-screen previews
    previewAccent,
    previewVoice,
    stopPreview: stopSpeaking,
  }
}
