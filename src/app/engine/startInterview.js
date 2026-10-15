import { generateQuestions } from "../../lib/gemini"
import { pickQuestions, getRecentQuestions, rememberQuestions } from "../../lib/questions"
import { matchesType } from "../../lib/questionTypes"
import { MIN_JD_CHARS } from "../../lib/limits"
import { JD_QUESTION_COUNT } from "../../lib/interviewConfig"
import { resetPhrase } from "../../lib/time"
import { messageForError } from "../../lib/errorMessages"

// Builds the "Start interview" handler. Not a hook: it returns a plain function that closes over
// the current setup choices, so it always sees what the user picked at the moment of the click.
//
// Preset roles: questions come from the local bank (plus optional job-description questions).
// Custom role ("Other"): Full AI Mode only, and ALL questions are written by the AI for that role.
export function createStartInterview({
  form,
  effectiveMode,
  requiresFullAi,
  customRoleBlocked,
  jdAvailable,
  followUpsAvailable,
  setupMode,
  applyUsage,
  starting,
  setStarting,
  setNotice,
  interviewIdRef,
  beginSession,
}) {
  return async function startInterview() {
    if (starting || !form.roleReady) return

    if (customRoleBlocked) {
      setNotice(
        `Custom roles need Full AI Mode and 2 AI evaluations (one for your questions, one for scoring). They reset ${resetPhrase()}. Pick a preset role to use Practice Mode.`
      )
      return
    }

    // Capture the setup choices now: the user could touch the form while questions are generated.
    const mode = effectiveMode
    const role = form.effectiveRole
    const seniority = form.seniority
    const count = form.questionCount
    const type = form.questionType
    const jd = form.jobDescription.trim()
    const useJd = jdAvailable && jd.length >= MIN_JD_CHARS
    const save = form.saveHistory
    const useFollowUps = form.followUps && followUpsAvailable

    const interviewId = ++interviewIdRef.current
    setNotice(null)

    let custom = []
    let note = null
    let failed = false
    let failReason = ""

    if (requiresFullAi || useJd) {
      setStarting(true)
      try {
        const result = await generateQuestions({
          role,
          seniority,
          jobDescription: useJd ? jd : "",
          // A custom role gets a full set from the AI. A preset role only adds a few tailored ones.
          count: requiresFullAi ? count : Math.min(JD_QUESTION_COUNT, count),
          type,
        })
        custom = result.questions
        applyUsage(result.usage)
        note = useJd
          ? `${custom.length} of these questions are tailored to the job description you pasted.`
          : `These questions were written for your "${role}" role.`
      } catch (err) {
        console.error("Couldn't generate tailored questions:", err)
        if (requiresFullAi) {
          failed = true
          failReason = messageForError(err)
        } else {
          note = "Couldn't generate job-specific questions, so a standard set was used."
        }
      } finally {
        setStarting(false)
      }
      // The user signed out or restarted while we were waiting.
      if (interviewIdRef.current !== interviewId) return

      if (failed) {
        setNotice(`Couldn't write questions for your custom role. ${failReason}`)
        return
      }
    }

    const questions = pickQuestions(role, seniority, count, {
      recent: getRecentQuestions(),
      custom,
      type,
    })
    const fromBank = questions.filter((q) => !custom.includes(q))
    rememberQuestions(fromBank)

    // The bank can run short for a type on a preset role.
    const offType = type === "mixed" ? 0 : fromBank.filter((q) => !matchesType(q, type)).length
    if (offType > 0) {
      const shortfall = `Only ${fromBank.length - offType} ${type} question${
        fromBank.length - offType === 1 ? "" : "s"
      } matched, so ${offType} general question${offType === 1 ? " was" : "s were"} added.`
      note = [note, shortfall].filter(Boolean).join(" ")
    }

    beginSession({
      config: { role, seniority, mode, save, followUps: useFollowUps && mode === "full" },
      questions,
      note,
      mode,
      inputMode: setupMode,
    })
  }
}