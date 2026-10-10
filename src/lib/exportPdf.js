import { averageScores, entryOverall } from "./scores"

// jsPDF is loaded on demand so it stays out of the main bundle.
// jsPDF's built-in fonts only cover Latin-1, so other characters are replaced with "?".

const MARGIN = 48
const COLOR = {
  text: [34, 32, 45],
  muted: [110, 106, 125],
  accent: [109, 40, 217],
  ok: [19, 122, 69],
  bad: [180, 35, 24],
  line: [220, 217, 230],
}

function clean(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00B7]/g, "-")
    .replace(/[\r\t]/g, " ")
    .replace(/[^\n\x20-\x7E\u00A0-\u00FF]/g, "?")
}

const slug = (s) =>
  String(s || "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const asDate = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date())

function yn(v) {
  return v ? "yes" : "no"
}

// session: [{ question, answer, inputMethod, isFollowUp, metrics, evaluation }]
// retries: { [answerIndex]: { answer, evaluation, mode } }  (optional)
export async function exportSessionPdf({
  role,
  seniority,
  mode,
  date,
  overallSummary,
  session,
  retries = {},
}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const width = pageW - MARGIN * 2
  let y = MARGIN

  const ensure = (h) => {
    if (y + h > pageH - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  const write = (text, { size = 10.5, style = "normal", color = COLOR.text, indent = 0, gap = 4 } = {}) => {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lineHeight = size * 1.38
    for (const line of doc.splitTextToSize(clean(text), width - indent)) {
      ensure(lineHeight)
      doc.text(line, MARGIN + indent, y + size)
      y += lineHeight
    }
    y += gap
  }

  const rule = () => {
    ensure(14)
    doc.setDrawColor(...COLOR.line)
    doc.line(MARGIN, y + 4, pageW - MARGIN, y + 4)
    y += 14
  }

  const when = asDate(date)
  const avg = averageScores(session)
  const modeLabel = mode === "full" ? "Full AI Mode" : "Practice Mode (scored locally)"

  // ---------- header ----------
  write("Interview session report", { size: 20, style: "bold", gap: 6 })
  write(
    `${role} | ${seniority} | ${modeLabel} | ${when.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`,
    { size: 10, color: COLOR.muted, gap: 10 }
  )
  write(
    `Content ${avg.content}    Clarity ${avg.clarity}    Confidence ${avg.confidence}    Overall ${avg.overall}`,
    { size: 12, style: "bold", color: COLOR.accent, gap: 8 }
  )
  if (mode !== "full") {
    write("Practice Mode scores come from speech metrics and answer length, not from AI feedback.", {
      size: 9.5,
      style: "italic",
      color: COLOR.muted,
    })
  }
  if (overallSummary) write(overallSummary, { gap: 8 })
  rule()

  // ---------- one block per answer ----------
  session.forEach((entry, i) => {
    const { evaluation, metrics = {} } = entry
    const typed = entry.inputMethod === "text"

    ensure(80)
    write(`Answer ${i + 1}${entry.isFollowUp ? "  (follow-up)" : ""}`, {
      size: 9,
      style: "bold",
      color: COLOR.muted,
      gap: 2,
    })
    write(entry.question, { size: 12, style: "bold", gap: 4 })
    write(entry.answer || "(no answer)", { color: COLOR.muted, gap: 6 })

    write(
      `Content ${evaluation.contentScore}   Clarity ${evaluation.clarityScore}   Confidence ${evaluation.confidenceScore}   (overall ${entryOverall(entry)})`,
      { size: 10, style: "bold", color: COLOR.accent, gap: 2 }
    )
    write(
      typed
        ? "Typed answer (no speech metrics)"
        : `Pace ${metrics.wpm ?? 0} wpm | Fillers ${metrics.fillerCount ?? 0} | Started after ${metrics.responseDelaySec ?? 0}s`,
      { size: 9.5, color: COLOR.muted, gap: 4 }
    )

    if (evaluation.star) {
      const s = evaluation.star
      const allThere = s.situation && s.task && s.action && s.result
      write(
        `STAR: Situation ${yn(s.situation)} | Task ${yn(s.task)} | Action ${yn(s.action)} | Result ${yn(s.result)}`,
        { size: 9.5, color: allThere ? COLOR.ok : COLOR.bad, gap: 4 }
      )
    }

    if (evaluation.feedback) write(evaluation.feedback, { gap: 3 })
    if (evaluation.improvementTip) {
      write(`Tip: ${evaluation.improvementTip}`, { size: 10, style: "bold", color: COLOR.accent, gap: 4 })
    }
    if (evaluation.strongAnswer) {
      write("Sample strong answer", { size: 9.5, style: "bold", color: COLOR.muted, gap: 1 })
      write(evaluation.strongAnswer, { size: 10, style: "italic", indent: 10, gap: 4 })
    }

    const retry = retries[i]
    if (retry) {
      const before = entryOverall(entry)
      const after = entryOverall(retry)
      const delta = after - before
      write(`Retry: ${before} -> ${after} (${delta > 0 ? "+" : ""}${delta === 0 ? "no change" : delta})`, {
        size: 10.5,
        style: "bold",
        color: delta >= 0 ? COLOR.ok : COLOR.bad,
        gap: 2,
      })
      write(retry.answer || "", { color: COLOR.muted, indent: 10, gap: 2 })
      write(
        `Content ${retry.evaluation.contentScore}   Clarity ${retry.evaluation.clarityScore}   Confidence ${retry.evaluation.confidenceScore}`,
        { size: 9.5, color: COLOR.accent, indent: 10, gap: 2 }
      )
      if (retry.evaluation.feedback) write(retry.evaluation.feedback, { indent: 10, gap: 4 })
    }

    rule()
  })

  // ---------- footer with page numbers ----------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...COLOR.muted)
    doc.text(`AI Interview Coach  -  page ${p} of ${pages}`, pageW - MARGIN, pageH - 24, { align: "right" })
  }

  doc.save(`interview-${slug(role)}-${when.toISOString().slice(0, 10)}.pdf`)
}
