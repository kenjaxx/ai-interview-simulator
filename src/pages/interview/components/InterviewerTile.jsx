import Avatar from "./Avatar"
import { getInterviewer } from "../../../lib/interviewers"

const LABELS = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
}

// The big interviewer "video tile": name and status on top, a progress bar, the animated avatar,
// and the question as subtitles at the bottom. Replaces InterviewerStage.
//   current   how many main questions are already finished (the 0-based index of the current one)
//   done      true while the final scoring runs, so every segment is filled
//   showRing  false while retrying a single answer, where "question 2 of 6" doesn't apply
//   busyText  replaces the question while the app is busy (scoring, preparing a follow-up)
export default function InterviewerTile({
  state,
  interviewerId,
  getLevel,
  subscribeWord,
  current,
  total,
  done = false,
  showRing = true,
  question,
  busyText = null,
}) {
  const person = getInterviewer(interviewerId)
  const finished = done ? total : Math.min(current, total)

  const progressProps = showRing
    ? {
        role: "progressbar",
        "aria-label": "Interview progress",
        "aria-valuemin": 0,
        "aria-valuemax": total,
        "aria-valuenow": finished,
        "aria-valuetext": `${finished} of ${total} questions done`,
      }
    : {}

  return (
    <section className={`tile tile--${state}`} aria-label={`Interviewer ${person.name}`}>
      <div className="tile-top">
        <span className="tile-name">{person.name} · Interviewer</span>
        <span className="tile-status">
          {LABELS[state] ?? LABELS.idle}
          <span className="tile-eq" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>

      {showRing && (
        <div className="tile-progress" {...progressProps}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`tile-seg ${
                i < finished ? "tile-seg--done" : i === finished ? "tile-seg--current" : ""
              }`}
            />
          ))}
        </div>
      )}

      <div className="tile-stage">
        <div className="tile-aura" aria-hidden="true" />
        <div className="tile-avatar">
          <Avatar
            state={state}
            interviewerId={interviewerId}
            getLevel={getLevel}
            subscribeWord={subscribeWord}
          />
        </div>
      </div>

      <p className="tile-caption" id="current-question">
        {busyText ?? question}
      </p>
    </section>
  )
}