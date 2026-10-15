import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import ToastViewport from "../../common/components/ToastViewport"

const ToastContext = createContext(null)

const MAX_TOASTS = 3
const DEFAULT_MS = 4000
const ERROR_MS = 7000

// Small notifications for save and delete results. Wrap the app in <ToastProvider>, then call
// useToast().success("...") or .error("...") from any component.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message, { type = "info", duration } = {}) => {
      const id = ++nextId.current
      setToasts((list) => [...list, { id, message, type }].slice(-MAX_TOASTS))
      const ms = duration ?? (type === "error" ? ERROR_MS : DEFAULT_MS)
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms)
      )
      return id
    },
    [dismiss]
  )

  // One stable object, so effects that depend on it don't re-run on every render.
  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show(message, { ...options, type: "success" }),
      error: (message, options) => show(message, { ...options, type: "error" }),
    }),
    [show, dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}