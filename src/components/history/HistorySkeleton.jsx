import "../feedback.css"

// Placeholder shaped like the loaded History screen (stat cards, filters, chart, list rows),
// so the page doesn't jump when the data arrives. Screen readers get one "Loading" message.
export default function HistorySkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your sessions…</span>

      <div aria-hidden="true">
        <div className="skeleton-filters">
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
        </div>

        <div className="skeleton-stats">
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
        </div>

        <div className="skeleton skeleton-chart" />

        <ul className="skeleton-list">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="skeleton skeleton-item" />
          ))}
        </ul>
      </div>
    </div>
  )
}