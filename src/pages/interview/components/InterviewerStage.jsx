import Avatar from "./Avatar"
import { getInterviewer } from "../../../lib/interviewers"
import { ringSegments, arcPath, RING_CENTER, RING_RADIUS } from "../../../lib/ring"
import "./Avatar.css"

const LABELS = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
}

// The interviewer's face inside a progress ring: one segment per main question (finished, current,
// upcoming), with the interviewer's name and state underneath. Replaces the Orb and the progress bar.
//   current   how many main questions are already finished (the 0-based index of the current one)
//   done      true while the final scoring runs, so every segment is filled
//   showRing  false while retrying a single answer, where "question 2 of 6" doesn't apply
export default function InterviewerStage({
  state,
  interviewerId,
  getLevel,
  subscribeWord,
  current,
  total,
  done = false,
  showRing = true,
}) {
  const person = getInterviewer(interviewerId)
  const finished = done ? total : Math.min(current, total)
  const segments = showRing ? ringSegments(total) : []

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
    <div className="stage-wrap">
      <div className="stage" {...progressProps}>
        {showRing && (
          <svg className="stage-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            {segments.map((s, i) => (
              <path
                key={i}
                className={`ring-seg ${
                  i < finished ? "ring-seg--done" : i === finished ? "ring-seg--current" : ""
                }`}
                d={arcPath(RING_CENTER, RING_CENTER, RING_RADIUS, s.start, s.end)}
              />
            ))}
          </svg>
        )}
        <Avatar
          state={state}
          interviewerId={interviewerId}
          getLevel={getLevel}
          subscribeWord={subscribeWord}
        />
      </div>
      <p className="stage-label">
        {person.name} · {LABELS[state] ?? LABELS.idle}
      </p>
    </div>
  )
}