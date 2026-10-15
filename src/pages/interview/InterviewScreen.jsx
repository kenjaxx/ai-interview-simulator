import Header from "../../common/components/Header"
import InterviewerTile from "./components/InterviewerTile"
import YouTile from "./components/YouTile"
import AnswerPanel from "./components/AnswerPanel"
import InterviewControls from "./components/InterviewControls"
import "./components/interview-call.css"
import "./interview.fit.css" // keep last: it holds the layout and the small-screen rules

// The interview as a video call: the interviewer on the left, you and your answer on the right,
// and one control dock underneath. Also used for retrying a single answer.
// interview: the `interview` object from useInterview().
export default function InterviewScreen({ interview }) {
  const { isRetry, awaitingFinalScore: scoring, isFollowUp, preparingFollowUp } = interview
  const busy = scoring || preparingFollowUp

  let progress
  if (preparingFollowUp) {
    progress = "Thinking of a follow-up…"
  } else if (scoring) {
    progress = isRetry ? "Scoring your retry…" : "Scoring your interview…"
  } else if (isRetry) {
    progress = `Retry · re-answering answer ${interview.retryQuestionNumber}`
  } else if (isFollowUp) {
    progress = `Follow-up · question ${Math.min(interview.questionIndex + 1, interview.questionTotal)} of ${interview.questionTotal}`
  } else {
    progress = `Question ${Math.min(interview.questionIndex + 1, interview.questionTotal)} of ${interview.questionTotal} · ${interview.answeredCount} answered`
  }

  // What the interviewer's subtitle bar says while the app is busy (instead of the question).
  let busyText = null
  if (preparingFollowUp) busyText = "Reading your answer…"
  else if (scoring) busyText = isRetry ? "Scoring your retry…" : "Scoring your interview…"

  // Changes for every new question, so the timer and the typing box start fresh.
  const questionKey = `${isRetry ? "retry" : "q"}-${interview.questionIndex}-${interview.retryQuestionNumber}-${isFollowUp ? "f" : "m"}`

  return (
    <div className="page page--interview">
      <Header />
      <div className="interview-shell">
        <InterviewerTile
          state={interview.orbState}
          interviewerId={interview.interviewerId}
          getLevel={interview.getLevel}
          subscribeWord={interview.subscribeWord}
          current={interview.questionIndex}
          total={interview.questionTotal}
          done={scoring}
          showRing={!isRetry}
          question={interview.currentQuestion}
          busyText={busyText}
        />

        <div className="interview-side">
          <YouTile
            inputMode={interview.inputMode}
            isListening={interview.isListening}
            getLevel={interview.getLevel}
          />
          <AnswerPanel interview={interview} progress={progress} questionKey={questionKey} busy={busy} />
        </div>

        <InterviewControls interview={interview} busy={busy} />
      </div>
    </div>
  )
}