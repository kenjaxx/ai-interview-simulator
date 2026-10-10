import { useMediaQuery } from "../../hooks/useMediaQuery"
import MoreMenu from "./MoreMenu"
import "./interview-ui.css"

// The row of buttons under the question. On wide screens every action is a button. On narrow
// screens the less-used ones (replay, re-record, switch input) move into a "More" menu, so the
// row never wraps into a wall of buttons.
// interview: the `interview` object from useInterview().
export default function InterviewControls({ interview }) {
  const compact = useMediaQuery("(max-width: 520px)")
  const { isRetry, inputMode, isListening, isFollowUp, ttsSupported, voiceOk, answeredCount } = interview

  // collapsible: moves into the "More" menu on narrow screens.
  const actions = [
    { id: "replay", label: "Replay question", onClick: interview.replay, disabled: !ttsSupported, collapsible: true },
  ]
  if (inputMode === "voice") {
    actions.push({
      id: "rerecord",
      label: "Re-record",
      onClick: interview.reRecord,
      disabled: !isListening,
      collapsible: true,
    })
  }
  if (!isRetry) {
    actions.push({ id: "skip", label: isFollowUp ? "Skip follow-up" : "Skip", onClick: interview.skip })
  }
  if (inputMode === "voice") {
    actions.push({ id: "type", label: "Type instead", onClick: interview.switchToText, collapsible: true })
  } else if (voiceOk) {
    actions.push({ id: "voice", label: "Use voice", onClick: interview.switchToVoice, collapsible: true })
  }
  actions.push(
    isRetry
      ? { id: "cancel", label: "Cancel retry", onClick: interview.cancelRetry, danger: true }
      : {
          id: "end",
          label: answeredCount > 0 ? "End & score" : "Quit",
          onClick: interview.endEarly,
          danger: true,
        }
  )

  const menuItems = compact ? actions.filter((a) => a.collapsible) : []
  const inline = compact ? actions.filter((a) => !a.collapsible) : actions
  const regular = inline.filter((a) => !a.danger)
  const danger = inline.filter((a) => a.danger)

  const button = (a) => (
    <button
      key={a.id}
      type="button"
      className={`secondary-btn ${a.danger ? "secondary-btn--danger" : ""}`}
      onClick={a.onClick}
      disabled={a.disabled}
    >
      {a.label}
    </button>
  )

  return (
    <div className="interview-controls">
      {regular.map(button)}
      {menuItems.length > 0 && <MoreMenu items={menuItems} />}
      {danger.map(button)}
    </div>
  )
}