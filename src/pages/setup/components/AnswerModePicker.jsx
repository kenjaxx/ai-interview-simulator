import { voiceAvailable } from "../../../lib/support"
import SegmentedControl from "./SegmentedControl"
import MicTest from "./MicTest"
import "./AnswerModePicker.css"

// value: "voice" | "text"
// support: result of getSupport()
// mic: { state, testing, request, report } from useMicPermission()
export default function AnswerModePicker({ value, onChange, support, mic }) {
  const voiceOk = voiceAvailable(support, mic.state)

  const options = [
    { value: "voice", label: "🎙 Voice", disabled: !voiceOk },
    { value: "text", label: "⌨ Typing" },
  ]

  return (
    <div className="field">
      <span className="field-label" id="answer-mode-label">
        Answer by
      </span>

      <SegmentedControl labelId="answer-mode-label" options={options} value={value} onChange={onChange} />

      {!support.recognition && (
        <p className="mode-notice mode-notice--warn" role="status">
          This browser doesn't support speech recognition. Use Chrome or Edge for voice answers, or type your
          answers.
        </p>
      )}
      {support.recognition && !support.mic && (
        <p className="mode-notice mode-notice--warn" role="status">
          This browser can't access a microphone here (this usually needs a secure https page). You can type
          your answers instead.
        </p>
      )}
      {support.recognition && support.mic && mic.state === "denied" && (
        <p className="mode-notice mode-notice--warn" role="status">
          Microphone access is blocked for this site. Allow it from the lock icon in the address bar, or type
          your answers.
        </p>
      )}
      {support.recognition && support.mic && mic.state === "missing" && (
        <p className="mode-notice mode-notice--warn" role="status">
          No microphone was found. Connect one, or type your answers.
        </p>
      )}
      {voiceOk && mic.state === "granted" && (
        <p className="mode-notice mode-notice--ok" role="status">
          Microphone ready.
        </p>
      )}
      {voiceOk && <MicTest mic={mic} />}
      {!support.synthesis && (
        <p className="mode-notice" role="status">
          This browser can't read questions aloud, so they'll only appear on screen.
        </p>
      )}
    </div>
  )
}