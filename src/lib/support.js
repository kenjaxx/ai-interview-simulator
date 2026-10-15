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

// Phones and tablets. On these, a second microphone stream next to speech recognition makes the
// two fight over the mic (extra permission prompts, quiet playback, "mic not detected").
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false
  const iPadOnMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || iPadOnMac
}