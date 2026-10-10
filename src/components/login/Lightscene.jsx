import { useEffect, useRef } from "react"

// The cinematic backdrop for the login page: a soft volumetric beam that follows the pointer, a pool
// of light where it lands, dust that only shows inside the light, a faint lens flare, a vignette and
// film grain. It also lights up the glass card by writing three CSS variables onto it:
//   --glow  0-1, how close the light is to the card (drives the border highlight and sheen)
//   --sx / --sy  where the light is, relative to the card (drives the sheen position)
//
// Performance notes (this used to lag):
//   - The beam, pool, source glow, streak and dust are all drawn on ONE canvas, instead of many
//     blurred, blended DOM elements that were re-laid-out every frame.
//   - The canvas renders at RENDER_SCALE of its CSS size. The light is soft anyway, so the browser
//     upscaling it looks the same and costs a fraction of the fill work.
//   - The beam is a texture generated once (a soft cone), then rotated and scaled each frame.
//   - Sizes are measured when something resizes, never inside the animation loop.
//   - The card variables are only written every few frames, and only when they actually changed.
//
// Render it as the first child of the positioned stage. It reads the stage from its own parent.
//   cardRef  ref to the glass card element

const DUST_COUNT = 40
const BEAM_FOLLOW = 0.1 // 0-1, lower = lazier, more cinematic lag
const RENDER_SCALE = 0.5 // canvas resolution vs. screen. 0.5 = quarter of the pixels. Raise for sharper dust.
const CARD_UPDATE_EVERY = 2 // write the card's CSS variables every Nth frame
const DEFAULT_LIGHT = [232, 224, 255] // used if --lc can't be read from the stylesheet

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

// Reads the light colour ("r, g, b") from the --lc variable in Login.css.
function readLight(stage) {
  const raw = getComputedStyle(stage).getPropertyValue("--lc")
  const parts = raw.split(",").map((s) => parseInt(s, 10))
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : DEFAULT_LIGHT
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return c
}

// A soft cone of light, pointing down from the top-centre: narrow at the top, wide at the bottom,
// Gaussian across, fading out along its length. It is tiny (64x128) and gets stretched when drawn,
// and the smooth upscaling is what gives it soft edges without any blur filter.
function makeBeamSprite([r, g, b]) {
  const w = 64
  const h = 128
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext("2d")
  const img = ctx.createImageData(w, h)
  const edge = Math.exp(-3)

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    const half = 0.12 + 0.38 * t // half-width of the cone at this height (fraction of the width)
    const fade = t < 0.38 ? 1 - 0.45 * (t / 0.38) : 0.55 * (1 - (t - 0.38) / 0.62)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x / (w - 1) - 0.5) / half
      const across = d >= 1 ? 0 : (Math.exp(-3 * d * d) - edge) / (1 - edge)
      const i = (y * w + x) * 4
      img.data[i] = r
      img.data[i + 1] = g
      img.data[i + 2] = b
      img.data[i + 3] = Math.round(255 * 0.6 * across * fade)
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// A soft round glow from a radial gradient. stops: [[offset, cssColor], ...]
function makeGlowSprite(stops) {
  const size = 64
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext("2d")
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, (size / 2) * Math.SQRT2)
  stops.forEach(([offset, color]) => g.addColorStop(offset, color))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return canvas
}

export default function LightScene({ cardRef }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const stage = root?.parentElement
    const ctx = canvas?.getContext("2d")
    if (!root || !canvas || !stage || !ctx) return

    const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    // ---------- one-time setup ----------
    const light = readLight(stage)
    const [lr, lg, lb] = light
    const rgba = (a) => `rgba(${lr}, ${lg}, ${lb}, ${a})`

    const beamSprite = makeBeamSprite(light)
    const poolSprite = makeGlowSprite([
      [0, rgba(0.3)],
      [0.45, rgba(0.08)],
      [0.7, rgba(0)],
    ])
    const sourceSprite = makeGlowSprite([
      [0, "rgba(255, 255, 255, 0.7)"],
      [0.3, rgba(0.22)],
      [0.68, rgba(0)],
    ])
    const streakGradient = ctx.createLinearGradient(0, 0, 480, 0)
    streakGradient.addColorStop(0, rgba(0))
    streakGradient.addColorStop(0.5, rgba(0.6))
    streakGradient.addColorStop(1, rgba(0))

    // ---------- measurements (updated on resize, never inside the loop) ----------
    let W = 0
    let H = 0
    let cardBox = null // card position relative to the stage

    const measure = () => {
      W = stage.clientWidth
      H = stage.clientHeight
      const cw = Math.max(1, Math.round(W * RENDER_SCALE))
      const ch = Math.max(1, Math.round(H * RENDER_SCALE))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      const card = cardRef?.current
      if (card) {
        const c = card.getBoundingClientRect()
        const s = stage.getBoundingClientRect()
        cardBox = { left: c.left - s.left, top: c.top - s.top, width: c.width, height: c.height }
      }
    }
    measure()

    // Dust motes live as plain objects and are drawn on the canvas.
    const dust = Array.from({ length: DUST_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.08 + Math.random() * 0.22,
      phase: Math.random() * 6,
      bright: 0.5 + Math.random() * 0.5,
    }))

    // Where the light is aimed (target) and where it is now (current, eased toward the target).
    let tx = W * 0.42
    let ty = H * 0.5
    let cx = tx
    let cy = ty
    let pointerInside = false

    let raf = 0
    let drawQueued = false
    let frameCount = 0
    let lastGlow = ""
    const startedAt = performance.now()

    // ---------- drawing ----------
    const draw = (now) => {
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
      const angle = -Math.atan2(dx, dy)

      // Draw in CSS pixels; the transform scales them down to the smaller canvas.
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = "lighter" // adds light on top of light, like the old "screen"

      // Three beam layers, rotated around the source: wide and faint, medium, narrow and bright.
      ctx.save()
      ctx.translate(ox, oy)
      ctx.rotate(angle)
      const layer = (widthFactor, heightFactor, alpha) => {
        const w = length * widthFactor
        ctx.globalAlpha = alpha
        ctx.drawImage(beamSprite, -w / 2, 0, w, length * heightFactor)
      }
      layer(0.9, 1.05, 0.28)
      layer(0.55, 1, 0.75)
      layer(0.26, 0.8, 0.73)
      ctx.restore()

      ctx.globalAlpha = 1
      ctx.drawImage(poolSprite, cx - 210, cy - 115, 420, 230)
      ctx.drawImage(sourceSprite, ox - 130, oy - 130, 260, 260)

      ctx.save()
      ctx.translate(ox - 240, oy + 7)
      ctx.fillStyle = streakGradient
      ctx.fillRect(0, 0, 480, 2)
      ctx.restore()

      // Dust is only visible where light reaches it: inside the cone, or near the pool.
      ctx.fillStyle = `rgb(${lr}, ${lg}, ${lb})`
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
        let lit = 0
        if (along > 0 && along < length) {
          const across = Math.abs(vx * uy - vy * ux)
          const halfWidth = along * 0.17 + 14
          lit = Math.exp(-2.2 * (across / halfWidth) ** 2) * (1 - along / length)
        }
        const poolDist = Math.hypot(p.x - cx, p.y - cy)
        lit = Math.max(lit, Math.max(0, 1 - poolDist / 170) * 0.8)
        const alpha = lit * p.bright * 0.9
        if (alpha < 0.01) continue
        ctx.globalAlpha = alpha
        ctx.fillRect(p.x, p.y, 2, 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = "source-over"

      // Light the card. Only every few frames, and only when something actually changed.
      frameCount++
      const card = cardRef?.current
      if (card && cardBox && frameCount % CARD_UPDATE_EVERY === 0) {
        const left = cardBox.left
        const top = cardBox.top
        const nearestX = clamp(cx, left, left + cardBox.width)
        const nearestY = clamp(cy, top, top + cardBox.height)
        const glow = Math.max(0, 1 - Math.hypot(cx - nearestX, cy - nearestY) / 240)
        const g = glow.toFixed(2)
        const sx = Math.round(cx - left)
        const sy = Math.round(cy - top)
        const key = `${g}|${sx}|${sy}`
        if (key !== lastGlow) {
          lastGlow = key
          card.style.setProperty("--glow", g)
          card.style.setProperty("--sx", `${sx}px`)
          card.style.setProperty("--sy", `${sy}px`)
        }
      }
    }

    const loop = (now) => {
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    // With "reduce motion" on there is no loop: draw once, then only when the pointer moves.
    const requestDraw = () => {
      if (drawQueued) return
      drawQueued = true
      requestAnimationFrame((now) => {
        drawQueued = false
        draw(now)
      })
    }

    // ---------- events ----------
    const onPointer = (event) => {
      const rect = stage.getBoundingClientRect()
      tx = event.clientX - rect.left
      ty = event.clientY - rect.top
      pointerInside = true
      if (reduceMotion) requestDraw()
    }
    const onLeave = () => {
      pointerInside = false
    }
    const onResize = () => {
      measure()
      if (reduceMotion) requestDraw()
    }

    window.addEventListener("pointermove", onPointer, { passive: true })
    window.addEventListener("pointerdown", onPointer, { passive: true })
    window.addEventListener("blur", onLeave)
    document.documentElement.addEventListener("mouseleave", onLeave)

    // The card changes size when you switch between sign in / sign up / reset, and it slides in
    // when the page opens, so measure again when either happens.
    const card = cardRef?.current
    let observer = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(onResize)
      observer.observe(stage)
      if (card) observer.observe(card)
    } else {
      window.addEventListener("resize", onResize)
    }
    card?.addEventListener("animationend", onResize)

    if (reduceMotion) requestDraw()
    else raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("blur", onLeave)
      window.removeEventListener("resize", onResize)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      card?.removeEventListener("animationend", onResize)
      observer?.disconnect()
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

        <canvas className="login-canvas" ref={canvasRef} />
        <div className="login-vignette" />
      </div>
      <div className="login-grain" aria-hidden="true" />
    </>
  )
}