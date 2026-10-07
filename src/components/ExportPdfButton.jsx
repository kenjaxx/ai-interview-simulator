import { useState } from "react"

// meta: { role, seniority, mode, date }
export default function ExportPdfButton({ meta, overallSummary, session, retries, className = "secondary-btn" }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!meta || !session?.length) return null

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    try {
      const { exportSessionPdf } = await import("../lib/exportPdf")
      await exportSessionPdf({ ...meta, overallSummary, session, retries })
    } catch (err) {
      console.error("PDF export failed:", err)
      setError("Couldn't create the PDF. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span>
      <button type="button" className={className} onClick={handleClick} disabled={busy}>
        {busy ? "Preparing PDF…" : "Export PDF"}
      </button>
      {error && <p className="export-error" role="alert">{error}</p>}
    </span>
  )
}