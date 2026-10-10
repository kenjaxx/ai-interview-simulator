import "./interview-ui.css"

// One segment per main question: finished, current, upcoming.
//   current  how many main questions are already finished (the 0-based index of the current one)
//   done     true while the final scoring runs, so every segment is filled
export default function InterviewProgress({ current, total, done = false }) {
  const finished = done ? total : Math.min(current, total)

  return (
    <div
      className="interview-progress"
      role="progressbar"
      aria-label="Interview progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={finished}
      aria-valuetext={`${finished} of ${total} questions done`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`progress-seg ${
            i < finished ? "progress-seg--done" : i === finished ? "progress-seg--current" : ""
          }`}
        />
      ))}
    </div>
  )
}