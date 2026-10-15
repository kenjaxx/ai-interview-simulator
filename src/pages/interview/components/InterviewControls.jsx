import { Icon } from "./DockIcons"

function DockButton({ icon, label, tone, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`dock-btn ${tone ? `dock-btn--${tone}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={17} />
      <span className="dock-label">{label}</span>
    </button>
  )
}

// The control dock under the call. Labels hide on narrow screens, so every action stays one tap away
// without a "More" menu. While the app is busy (scoring, preparing a follow-up) the dock is disabled.
// interview: the `interview` object from useInterview().
export default function InterviewControls({ interview, busy = false }) {
  const { isRetry, inputMode, isListening, isFollowUp, ttsSupported, voiceOk, answeredCount, reviewDraft } =
    interview
  const reviewing = !!reviewDraft
  const voice = inputMode === "voice"

  return (
    <div className="dock" role="toolbar" aria-label="Interview controls">
      {voice ? (
        <span
          className={`dock-mic ${isListening ? "dock-mic--live" : ""}`}
          role="img"
          aria-label={isListening ? "Microphone is listening" : "Microphone is off"}
        >
          <Icon name="mic" size={20} />
        </span>
      ) : (
        voiceOk && (
          <button
            type="button"
            className="dock-mic dock-mic--btn"
            aria-label="Use voice"
            title="Use voice"
            onClick={interview.switchToVoice}
            disabled={busy}
          >
            <Icon name="mic" size={20} />
          </button>
        )
      )}

      {voice && isListening && !reviewing && (
        <DockButton tone="go" icon="check" label="Done" onClick={interview.finishAnswer} disabled={busy} />
      )}

      {/* While reviewing, "Replay" would throw away the edited text. */}
      <DockButton
        icon="replay"
        label="Replay"
        onClick={interview.replay}
        disabled={busy || !ttsSupported || reviewing}
      />

      {voice && (
        <DockButton
          icon="redo"
          label="Re-record"
          onClick={interview.reRecord}
          disabled={busy || (!isListening && !reviewing)}
        />
      )}

      {voice && (
        <DockButton
          icon="keyboard"
          label="Type"
          onClick={interview.switchToText}
          disabled={busy || reviewing}
        />
      )}

      {!isRetry && (
        <DockButton
          icon="skip"
          label={isFollowUp ? "Skip follow-up" : "Skip"}
          onClick={interview.skip}
          disabled={busy}
        />
      )}

      <DockButton
        tone="end"
        icon="x"
        label={isRetry ? "Cancel retry" : answeredCount > 0 ? "End & score" : "Quit"}
        onClick={isRetry ? interview.cancelRetry : interview.endEarly}
        disabled={busy}
      />
    </div>
  )
}