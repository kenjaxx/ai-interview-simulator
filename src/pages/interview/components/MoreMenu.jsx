import { useEffect, useId, useRef, useState } from "react"
import "./interview-ui.css"

// A small overflow menu: a "More" button that opens a list of actions.
//   items  [{ id, label, onClick, disabled? }]
// Keyboard: ArrowDown on the button opens it, Up/Down move between items, Escape closes and returns
// focus to the button, Tab closes. Clicking elsewhere closes it too.
export default function MoreMenu({ items, label = "More" }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const menuId = useId()

  const enabledItems = () => Array.from(wrapRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])

  // On open: focus the first item and close when the user clicks or taps outside.
  useEffect(() => {
    if (!open) return
    enabledItems()[0]?.focus()

    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const onMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key === "Tab") {
      setOpen(false)
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return

    event.preventDefault()
    const els = enabledItems()
    if (els.length === 0) return
    const index = els.indexOf(document.activeElement)
    const next = event.key === "ArrowDown" ? (index + 1) % els.length : (index - 1 + els.length) % els.length
    els[next].focus()
  }

  return (
    <div className="more-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="secondary-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        {label} ▾
      </button>

      {open && (
        <div id={menuId} className="more-menu-list" role="menu" aria-label="More actions" onKeyDown={onMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="more-menu-item"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}