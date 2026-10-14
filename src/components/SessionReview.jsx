import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { averageScores, findWeakestIndex, isWeak, entryOverall, WEAK_BELOW } from "../lib/scores"
import { ScoreHelp } from "./ReviewParts"
import ReviewCard from "./ReviewCard"
import "./SessionReview.css"

// One shared empty object. A fresh `{}` default on every render would defeat React.memo.
const NO_RETRIES = {}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// Score cards plus one review card per answer. Used by the summary screen and the history view.
//   retries      optional map of answer index -> retry result (summary screen only)
//   sessionMode  "practice" | "full", used to flag retries scored differently from the original
//   showScores   false hides the three average cards (the summary screen shows score rings instead)
//   collapsible  cards fold up, and a toolbar adds "Jump to weakest answer", "Weak answers only"
//                and "Expand all / Collapse all". At first only the weakest answer (and any answer
//                that has a retry result) is open. Off by default, so History is unchanged.
//
// Memoized: props are stable references (state from the interview hook or from the history cache),
// so typing, timers and quota updates elsewhere never re-render the review.
function SessionReview({ session, retries = NO_RETRIES, sessionMode, showScores = true, collapsible = false }) {
  const avg = useMemo(() => averageScores(session), [session])
  const total = session?.length ?? 0

  // Lowest overall score in the whole session, whether or not it was already retried.
  const weakestIndex = useMemo(() => (total ? findWeakestIndex(session) : -1), [session, total])
  const weakIndexes = useMemo(
    () => (session ?? []).flatMap((entry, i) => (isWeak(entry) ? [i] : [])),
    [session]
  )
  // The filter only makes sense when it would hide some answers but not all of them.
  const canFilterWeak = weakIndexes.length > 0 && weakIndexes.length < total

  const [open, setOpen] = useState(() => {
    const initial = new Set(Object.keys(retries).map(Number))
    if (weakestIndex >= 0) initial.add(weakestIndex)
    return initial
  })
  const [onlyWeak, setOnlyWeak] = useState(false)

  // "Jump to weakest": state changes first, then this effect scrolls once the card is on screen.
  const jumpRef = useRef(null)
  const [jumpTick, setJumpTick] = useState(0)

  useEffect(() => {
    const target = jumpRef.current
    if (target === null) return
    jumpRef.current = null
    const el = document.getElementById(`review-card-${target}`)
    if (!el) return
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })
    el.querySelector(".review-toggle")?.focus({ preventScroll: true })
  }, [jumpTick])

  const toggleCard = useCallback((index) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  if (!total) {
    return <p className="review-empty">No answers were recorded for this session.</p>
  }

  const filtering = collapsible && onlyWeak && canFilterWeak
  const visibleIndexes = filtering ? weakIndexes : session.map((_, i) => i)
  const allOpen = visibleIndexes.every((i) => open.has(i))

  const jumpToWeakest = () => {
    if (weakestIndex < 0) return
    // If the weak-only filter would hide it, switch the filter off.
    if (!isWeak(session[weakestIndex])) setOnlyWeak(false)
    setOpen((prev) => new Set(prev).add(weakestIndex))
    jumpRef.current = weakestIndex
    setJumpTick((t) => t + 1)
  }

  const toggleAll = () => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (allOpen) visibleIndexes.forEach((i) => next.delete(i))
      else visibleIndexes.forEach((i) => next.add(i))
      return next
    })
  }

  return (
    <>
      <ScoreHelp />

      {showScores && (
        <div className="score-row">
          <div className="score-card">
            <span>{avg.content}</span>
            <p className="score-label">Content</p>
          </div>
          <div className="score-card">
            <span>{avg.clarity}</span>
            <p className="score-label">Clarity</p>
          </div>
          <div className="score-card">
            <span>{avg.confidence}</span>
            <p className="score-label">Confidence</p>
          </div>
        </div>
      )}

      {collapsible && (
        <>
          <div className="review-tools">
            {weakestIndex >= 0 ? (
              <button type="button" className="link-btn" onClick={jumpToWeakest}>
                Jump to weakest answer (Answer {weakestIndex + 1}, score {entryOverall(session[weakestIndex])})
              </button>
            ) : (
              <span />
            )}
            <div className="review-tools-actions">
              {canFilterWeak && (
                <button
                  type="button"
                  className={`review-filter-btn ${filtering ? "review-filter-btn--on" : ""}`}
                  aria-pressed={filtering}
                  onClick={() => setOnlyWeak((v) => !v)}
                >
                  Weak answers only ({weakIndexes.length})
                </button>
              )}
              <button type="button" className="secondary-btn" onClick={toggleAll}>
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            </div>
          </div>
          {filtering && (
            <p className="review-tools-note" role="status">
              Showing {weakIndexes.length} of {total} answers, the ones that scored below {WEAK_BELOW}.
            </p>
          )}
        </>
      )}

      {visibleIndexes.map((i) => (
        <ReviewCard
          key={i}
          entry={session[i]}
          index={i}
          retry={retries[i]}
          sessionMode={sessionMode}
          collapsible={collapsible}
          open={open.has(i)}
          onToggle={toggleCard}
        />
      ))}
    </>
  )
}

export default memo(SessionReview)