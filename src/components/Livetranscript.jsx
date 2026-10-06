import { useSyncExternalStore } from "react"

// The only component that re-renders on every interim speech result.
// subscribe / getSnapshot come from useSpeechRecognition (subscribeTranscript / getTranscript).
export default function LiveTranscript({ subscribe, getSnapshot }) {
  const text = useSyncExternalStore(subscribe, getSnapshot)
  return <p className="live-transcript">{text || "Listening…"}</p>
}