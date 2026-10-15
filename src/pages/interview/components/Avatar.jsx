import { memo, useEffect, useRef } from "react"
import InterviewerFace from "../../../common/avatar/InterviewerFace"
import { getInterviewer } from "../../../lib/interviewers"
import "./Avatar.css"

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// Resting mouth shape for each state. While speaking, the mouth is pulsed open on every word.
const MOUTH = {
  idle: { rx: 6, ry: 1.8 },
  listening: { rx: 5.5, ry: 1.6 },
  thinking: { rx: 4.5, ry: 1.4 },
  speaking: { rx: 6, ry: 3.5 },
}
const MOUTH_CLOSED = { rx: 6, ry: 1.6 }

function setMouth(el, rx, ry) {
  if (!el) return
  el.setAttribute("rx", String(rx))
  el.setAttribute("ry", String(ry))
}

// state: "idle" | "listening" | "thinking" | "speaking"
// getLevel: () => 0-1 mic volume, polled every frame while listening (no React state involved)
// subscribeWord: (callback) => unsubscribe. Fires on each spoken word and drives the mouth.
//
// Like the orb it replaces, nothing here goes through React state per frame: the mouth, the
// listening swell and the blink are written straight to the DOM, so spoken words and mic volume
// never re-render React. Expressions that only change with the state (eyes looking up, raised
// brows, the thinking dots) are plain CSS driven by the avatar--{state} class.
//
// With "reduce motion" on, the JavaScript motion (mouth pulses, swell, blinking) is skipped. The
// expression and the border color still show the state.
//
// Memoized: props are a string, a string and two stable callbacks, so it only re-renders when the
// state or the interviewer changes.
function Avatar({ state, interviewerId, getLevel, subscribeWord }) {
  const person = getInterviewer(interviewerId)
  const rootRef = useRef(null)
  const mouthRef = useRef(null)
  const closeTimer = useRef(null)

  // Resting mouth for the current state.
  useEffect(() => {
    const m = MOUTH[state] ?? MOUTH.idle
    setMouth(mouthRef.current, m.rx, m.ry)
  }, [state])

  // Listening: the whole face swells a little with the mic volume.
  useEffect(() => {
    const el = rootRef.current
    if (state !== "listening" || prefersReducedMotion()) return

    let rafId
    const tick = () => {
      const level = getLevel ? getLevel() : 0
      if (el) el.style.transform = `scale(${1 + Math.min(level, 1) * 0.06})`
      rafId = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(rafId)
      if (el) el.style.transform = ""
    }
  }, [state, getLevel])

  // Speaking: open the mouth on every word, then close it again a moment later.
  useEffect(() => {
    if (state !== "speaking" || !subscribeWord || prefersReducedMotion()) return

    const pulse = () => {
      setMouth(mouthRef.current, 6.5, 4 + Math.random() * 4)
      clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(() => setMouth(mouthRef.current, MOUTH_CLOSED.rx, MOUTH_CLOSED.ry), 140)
    }

    pulse()
    const unsubscribe = subscribeWord(pulse)
    return () => {
      unsubscribe()
      clearTimeout(closeTimer.current)
    }
  }, [state, subscribeWord])

  // Blink every few seconds, at a slightly random interval so it doesn't look mechanical.
  useEffect(() => {
    if (prefersReducedMotion()) return

    let nextBlink
    let reopen
    const schedule = () => {
      nextBlink = setTimeout(
        () => {
          const el = rootRef.current
          if (el) {
            el.classList.add("is-blinking")
            reopen = setTimeout(() => el.classList.remove("is-blinking"), 130)
          }
          schedule()
        },
        2500 + Math.random() * 3000
      )
    }
    schedule()

    return () => {
      clearTimeout(nextBlink)
      clearTimeout(reopen)
    }
  }, [])

  return (
    <div ref={rootRef} className={`avatar avatar--${state}`} aria-hidden="true">
      <InterviewerFace person={person} mouthRef={mouthRef}>
        <g className="av-dots">
          <circle className="av-dot" cx="78" cy="19" r="3" />
          <circle className="av-dot" cx="86" cy="19" r="3" />
          <circle className="av-dot" cx="94" cy="19" r="3" />
        </g>
      </InterviewerFace>
    </div>
  )
}

export default memo(Avatar)