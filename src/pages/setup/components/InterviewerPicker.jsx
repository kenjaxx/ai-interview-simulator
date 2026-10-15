import InterviewerFace from "../../../common/avatar/InterviewerFace"
import { INTERVIEWERS, getInterviewer } from "../../../lib/interviewers"
import { resolveVoice } from "../../../lib/voices"
import { onRadioGroupKeyDown } from "../../../lib/radioKeys"
import "./InterviewerPicker.css"

// Which voice the chosen interviewer will really use in this browser, in words a user can follow.
function voiceNote(person, voices) {
  const { voice, match } = resolveVoice(person, voices)
  if (voices.length === 0) return "Checking for voices…"
  if (match === "preferred") return `${person.name} speaks with the voice "${voice.name}".`
  if (match === "similar") {
    return `${person.name}'s voice (${person.voice.names[0]}) isn't available in this browser, so a similar voice, "${voice.name}", is used instead.`
  }
  return `${person.name}'s voice isn't available in this browser, so the browser's default voice is used.`
}

// Pick who interviews you: the face and the voice come together. A radio group: Tab lands on the
// chosen interviewer, arrow keys move between them.
//   value      the chosen interviewer id
//   onChange   (id) => void
//   voices     SpeechSynthesisVoice[] from useTextToSpeech
//   speechOk   false when this browser can't read questions aloud (no voice note is shown then)
export default function InterviewerPicker({ value, onChange, voices = [], speechOk = true, disabled = false }) {
  const chosen = getInterviewer(value)

  return (
    <div className="field">
      <span className="field-label" id="interviewer-label">
        Interviewer
      </span>
      <div
        className="interviewer-list"
        role="radiogroup"
        aria-labelledby="interviewer-label"
        onKeyDown={onRadioGroupKeyDown}
      >
        {INTERVIEWERS.map((p) => {
          const active = p.id === chosen.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              className={`interviewer-opt ${active ? "interviewer-opt--on" : ""}`}
              onClick={() => onChange(p.id)}
            >
              <span className="interviewer-face">
                <InterviewerFace person={p} />
              </span>
              <span className="interviewer-name">{p.name}</span>
            </button>
          )
        })}
      </div>
      {speechOk && (
        <p className="mode-notice" role="status">
          {voiceNote(chosen, voices)}
        </p>
      )}
    </div>
  )
}