import { useSyncExternalStore } from "react"

// The only component that re-renders on every interim speech result.
// subscribe / getSnapshot come from useSpeechRecognition (subscribeTranscript / getTranscript).
// role="status" + aria-live="polite" lets screen readers follow along without interrupting.
export default function LiveTranscript({ subscribe, getSnapshot }) {
  const text = useSyncExternalStore(subscribe, getSnapshot)
  return (
    <p className="live-transcript" role="status" aria-live="polite">
      {text || "Listening…"}
    </p>
  )
}