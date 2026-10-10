// One circular score gauge. value is 0-100.
//   color  any CSS color (a var(--...) works)
//   delta  difference from the user's average, or null to hide the comparison
export default function ScoreRing({ value, label, color, size = 88, stroke = 8, delta = null }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value))
  const center = size / 2

  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "same"
  const deltaText = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "= avg"
  const deltaSpoken =
    delta > 0
      ? `${delta} points above your average`
      : delta < 0
        ? `${Math.abs(delta)} points below your average`
        : "the same as your average"

  return (
    <div className="score-ring">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${value} out of 100`}
      >
        <circle className="ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ stroke: color }}
        />
        <text className="ring-value" x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3}>
          {value}
        </text>
      </svg>
      <p className="ring-label">{label}</p>
      {delta !== null && (
        <p className={`ring-delta ring-delta--${tone}`}>
          <span aria-hidden="true">{deltaText}</span>
          <span className="sr-only">{deltaSpoken}</span>
        </p>
      )}
    </div>
  )
}