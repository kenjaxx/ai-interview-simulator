import { Component } from "react"

// Catches a lazy screen that failed to load (offline, or a new deploy replaced the old chunk files)
// and offers a reload instead of leaving a blank page.
export default class ChunkErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error("A screen failed to load:", error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="page-loading">
        <div className="error-panel" role="alert">
          <p>Something went wrong loading this screen. Check your connection and reload the page.</p>
          <button className="secondary-btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    )
  }
}