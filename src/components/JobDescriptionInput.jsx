// Optional: paste a job description and get tailored questions. Full AI Mode only.
export default function JobDescriptionInput({
  value,
  onChange,
  available,
  unavailableReason,
  min,
  max,
  disabled,
}) {
  const locked = !available || disabled
  const length = value.trim().length
  const tooShort = length > 0 && length < min

  return (
    <details className="jd-input">
      <summary>
        Tailor questions to a job description <span className="jd-optional">(optional)</span>
      </summary>

      {!available && unavailableReason && <p className="mode-notice">{unavailableReason}</p>}

      <label htmlFor="job-description" className="sr-only">
        Job description
      </label>
      <textarea
        id="job-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the job posting here…"
        rows={6}
        maxLength={max}
        disabled={locked}
      />
      <p className="mode-notice">
        {tooShort
          ? `Paste a little more (at least ${min} characters) to use it.`
          : "Adds 3 questions based on the posting. Uses 1 extra AI evaluation, and the text is sent to Google's Gemini API."}{" "}
        <span className="jd-count">
          {length}/{max}
        </span>
      </p>
    </details>
  )
}
