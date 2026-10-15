import { useState } from "react"
import { getSupport, voiceAvailable } from "../../lib/support"
import { useMicPermission } from "./useMicPermission"
import { useSpeechRecognition } from "./useSpeechRecognition"
import { useTextToSpeech } from "./useTextToSpeech"
import { useAudioLevel } from "./useAudioLevel"

// Bundles every browser speech feature (recognition, text-to-speech, mic permission, mic level), so
// the interview hook just calls one thing. The interviewer decides which voice speaks.
export function useSpeechIO({ interviewerId }) {
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
  } = useTextToSpeech({ interviewerId })

  // The mic stream is opened once per interview (acquireMic is idempotent) and released at the end.
  // getLevel is polled by the Avatar directly, so mic volume never causes a re-render.
  const { getLevel, acquireMic, releaseMic } = useAudioLevel()

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
  }
}