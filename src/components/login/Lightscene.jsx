import { useEffect, useRef } from "react"

// The cinematic backdrop for the login page: a soft volumetric beam that follows the pointer, a pool
// of light where it lands, dust that only shows inside the light, a faint lens flare, a vignette and
// film grain. It also lights up the glass card by writing three CSS variables onto it:
//   --glow  0-1, how close the light is to the card (drives border and shadow)
//   --sx / --sy  where the light is, relative to the card (drives the sheen)
//
// Everything animates by writing straight to the DOM from one requestAnimationFrame loop, so moving
// the mouse never re-renders React (same approach as the Orb and the live transcript).
//
// Render it as the first child of the positioned stage. It reads the stage from its own parent.
//   cardRef  ref to the glass card element

const DUST_COUNT = 46
const BEAM_FOLLOW = 0.1 // 0-1, lower = lazier, more cinematic lag

// Small seeded generator, so the stars are the same on every render (and render stays pure).
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STARS = (() => {
  const rand = mulberry32(7)
  return Array.from({ length: 34 }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    size: rand() < 0.15 ? 2 : 1,
    opacity: 0.08 + rand() * 0.3,
  }))
})()

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export default function LightScene({ cardRef }) {
  const rootRef = useRef(null)
  const wideRef = useRef(null)
  const midRef = useRef(null)
  const coreRef = useRef(null)
  const poolRef = useRef(null)
  const sourceRef = useRef(null)
  const streakRef = useRef(null)
  const dustRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const stage = root?.parentElement
    const dustLayer = dustRef.current
    if (!root || !stage || !dustLayer) return

    const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    let W = stage.clientWidth
    let H = stage.clientHeight

    // Dust motes live outside React: there are dozens and they move every frame.
    const dust = Array.from({ length: DUST_COUNT }, () => {
      const el = document.createElement("div")
      el.className = "login-dust"
      dustLayer.appendChild(el)
      return {
        el,
        x: Math.random() * W,
        y: Math.random() * H,
        speed: 0.08 + Math.random() * 0.22,
        phase: Math.random() * 6,
        bright: 0.5 + Math.random() * 0.5,
      }
    })

    // Where the light is aimed (target) and where it is now (current, eased toward the target).
    let tx = W * 0.42
    let ty = H * 0.5
    let cx = tx
    let cy = ty
    let pointerInside = false

    const onPointer = (event) => {
      const rect = stage.getBoundingClientRect()
      tx = event.clientX - rect.left
      ty = event.clientY - rect.top
      pointerInside = true
    }
    const onLeave = () => {
      pointerInside = false
    }
    window.addEventListener("pointermove", onPointer)
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("blur", onLeave)
    document.documentElement.addEventListener("mouseleave", onLeave)

    // A beam layer is an element rotated around its top-center, which is the light source.
    const place = (el, ox, oy, width, length, angle) => {
      if (!el) return
      const s = el.style
      s.left = `${ox - width / 2}px`
      s.top = `${oy}px`
      s.width = `${width}px`
      s.height = `${length}px`
      s.transform = `rotate(${angle}deg)`
    }

    const startedAt = performance.now()
    let raf = 0

    const frame = (now) => {
      W = stage.clientWidth
      H = stage.clientHeight
      const t = (now - startedAt) / 1000

      // Nobody is steering: let the light drift slowly so the page never looks frozen.
      if (!pointerInside && !reduceMotion) {
        tx = W * 0.42 + Math.sin(t * 0.55) * W * 0.22
        ty = H * 0.5 + Math.cos(t * 0.4) * H * 0.16
      }
      const follow = reduceMotion ? 1 : BEAM_FOLLOW
      cx += (tx - cx) * follow
      cy += (ty - cy) * follow

      // The source sits just above the top-right corner, off screen.
      const ox = W * 0.9
      const oy = -10
      const dx = cx - ox
      const dy = cy - oy
      const dist = Math.hypot(dx, dy) || 1
      const length = dist + 170
      const ux = dx / dist
      const uy = dy / dist
      const angle = (-Math.atan2(dx, dy) * 180) / Math.PI

      place(wideRef.current, ox, oy, length * 0.9, length * 1.05, angle)
      place(midRef.current, ox, oy, length * 0.55, length, angle)
      place(coreRef.current, ox, oy, length * 0.26, length * 0.8, angle)

      if (poolRef.current) poolRef.current.style.transform = `translate(${cx - 210}px, ${cy - 115}px)`
      if (sourceRef.current) sourceRef.current.style.transform = `translate(${ox - 130}px, ${oy - 130}px)`
      if (streakRef.current) streakRef.current.style.transform = `translate(${ox - 240}px, ${oy + 7}px)`

      // Dust is only visible where light reaches it: inside the cone, or near the pool.
      for (const p of dust) {
        if (!reduceMotion) {
          p.y -= p.speed
          p.x += Math.sin(t * 0.6 + p.phase) * 0.12
          if (p.y < 0) {
            p.y = H
            p.x = Math.random() * W
          }
        }
        const vx = p.x - ox
        const vy = p.y - oy
        const along = vx * ux + vy * uy
        let light = 0
        if (along > 0 && along < length) {
          const across = Math.abs(vx * uy - vy * ux)
          const halfWidth = along * 0.17 + 14
          light = Math.exp(-2.2 * (across / halfWidth) ** 2) * (1 - along / length)
        }
        const poolDist = Math.hypot(p.x - cx, p.y - cy)
        light = Math.max(light, Math.max(0, 1 - poolDist / 170) * 0.8)
        p.el.style.opacity = (light * p.bright * 0.9).toFixed(3)
        p.el.style.transform = `translate(${p.x}px, ${p.y}px)`
      }

      // Light the card: closer light means a brighter edge and a stronger sheen.
      const card = cardRef?.current
      if (card) {
        const c = card.getBoundingClientRect()
        const s = stage.getBoundingClientRect()
        const left = c.left - s.left
        const top = c.top - s.top
        const nearestX = clamp(cx, left, left + c.width)
        const nearestY = clamp(cy, top, top + c.height)
        const glow = Math.max(0, 1 - Math.hypot(cx - nearestX, cy - nearestY) / 240)
        card.style.setProperty("--glow", glow.toFixed(3))
        card.style.setProperty("--sx", `${(cx - left).toFixed(1)}px`)
        card.style.setProperty("--sy", `${(cy - top).toFixed(1)}px`)
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("blur", onLeave)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      dust.forEach((p) => p.el.remove())
    }
  }, [cardRef])

  return (
    <>
      <div className="login-scene" ref={rootRef} aria-hidden="true">
        <div className="login-ambient" />

        {STARS.map((s, i) => (
          <i
            key={i}
            className="login-star"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: s.opacity }}
          />
        ))}

        {/* The wrapper is blurred, the inner <i> is clipped to a cone. Blur has to be applied on the
            wrapper, otherwise the clip would cut the soft edge off and leave a hard line. */}
        <div className="login-beam login-beam--wide" ref={wideRef}>
          <i />
        </div>
        <div className="login-beam login-beam--mid" ref={midRef}>
          <i />
        </div>
        <div className="login-beam login-beam--core" ref={coreRef}>
          <i />
        </div>

        <div className="login-pool" ref={poolRef} />
        <div className="login-source" ref={sourceRef} />
        <div className="login-streak" ref={streakRef} />
        <div className="login-dust-layer" ref={dustRef} />
        <div className="login-vignette" />
      </div>
      <div className="login-grain" aria-hidden="true" />
    </>
  )
}