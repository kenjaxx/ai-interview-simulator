// What this browser can do, checked once on the setup screen instead of failing mid-interview.
export function getSupport() {
  if (typeof window === "undefined") return { recognition: false, synthesis: false, mic: false }
  return {
    recognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    synthesis: "speechSynthesis" in window,
    mic: !!navigator.mediaDevices?.getUserMedia,
  }
}

// micState comes from useMicPermission: "unknown" | "prompt" | "granted" | "denied" | "missing"
export function voiceAvailable(support, micState) {
  return support.recognition && support.mic && micState !== "denied" && micState !== "missing"
}
