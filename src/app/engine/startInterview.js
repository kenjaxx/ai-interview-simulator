import { generateQuestions } from "../../lib/gemini"
import { pickQuestions, getRecentQuestions, rememberQuestions } from "../../lib/questions"
import { matchesType } from "../../lib/questionTypes"
import { MIN_JD_CHARS } from "../../lib/limits"
import { JD_QUESTION_COUNT } from "../../lib/interviewConfig"

// Builds the "Start interview" handler. Not a hook: it returns a plain function that closes over
// the current setup choices, so it always sees what the user picked at the moment of the click.
//
// It captures the choices, optionally asks the AI for questions tailored to a job description,
// picks the rest from the local bank (honouring session length and question type), and hands the
// finished list to beginSession().
export function createStartInterview({
  form,
  effectiveMode,
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
    if (useJd) {
      setStarting(true)
      try {
        const result = await generateQuestions({
          role,
          seniority,
          jobDescription: jd,
          count: Math.min(JD_QUESTION_COUNT, count),
        })
        custom = result.questions
        applyUsage(result.usage)
        note = `${custom.length} of these questions are tailored to the job description you pasted.`
      } catch (err) {
        console.error("Couldn't generate tailored questions:", err)
        note = "Couldn't generate job-specific questions, so a standard set was used."
      } finally {
        setStarting(false)
      }
      // The user signed out or restarted while we were waiting.
      if (interviewIdRef.current !== interviewId) return
    }

    const questions = pickQuestions(role, seniority, count, {
      recent: getRecentQuestions(),
      custom,
      type,
    })
    const fromBank = questions.filter((q) => !custom.includes(q))
    rememberQuestions(fromBank)

    // The bank can run short for a type (a custom role has no technical questions, for example).
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