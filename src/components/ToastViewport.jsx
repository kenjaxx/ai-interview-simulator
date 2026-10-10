import "./feedback.css"

// toasts: [{ id, message, type: "info" | "success" | "error" }]
// Errors use role="alert" (announced right away); the rest use role="status" (announced politely).
export default function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} role={t.type === "error" ? "alert" : "status"}>
          <span>{t.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}