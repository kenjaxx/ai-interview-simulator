import { lazy, Suspense, useCallback, useEffect, useRef } from "react"
import Header from "../common/components/Header"
import Login from "../pages/login/Login"
import ChunkErrorBoundary from "../common/components/ChunkErrorBoundary"
import ScreenFocus from "../common/components/ScreenFocus"
import SetupScreen from "../pages/setup/SetupScreen"
import { useAuth } from "./context/AuthContext"
import { useInterview } from "./engine/useInterview"
import "./styles/base.css"
import "./styles/ui-extras.css"
import "./styles/fit-screen.css"

// Setup is the first screen after login, so it stays in the main bundle. Everything else is split
// into its own chunk. HistoryScreen pulls in the chart, trend and PDF-button code with it.
const loadInterviewScreen = () => import("../pages/interview/InterviewScreen")
const loadSummaryScreen = () => import("../pages/summary/SummaryScreen")
const loadHistoryScreen = () => import("../pages/history/HistoryScreen")

const InterviewScreen = lazy(loadInterviewScreen)
const SummaryScreen = lazy(loadSummaryScreen)
const HistoryScreen = lazy(loadHistoryScreen)

function ScreenFallback() {
  return (
    <div className="page-loading" role="status" aria-label="Loading">
      <div className="page-loading-spinner" />
    </div>
  )
}

function InlineFallback() {
  return (
    <div role="status" aria-label="Loading" style={{ padding: "4rem 0" }}>
      <div className="page-loading-spinner" style={{ margin: "0 auto" }} />
    </div>
  )
}

// Wraps a lazy screen: shows a spinner while its chunk loads, a reload prompt if the chunk fails
// (offline, or a new deploy removed the old files), and moves focus once the screen is on the page.
// ScreenFocus sits inside the Suspense boundary, so its effect only runs after the lazy content is
// committed and the heading exists.
function LazyScreen({ fallback = <ScreenFallback />, children }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={fallback}>
        {children}
        <ScreenFocus />
      </Suspense>
    </ChunkErrorBoundary>
  )
}

// Decides which screen to show. All interview logic lives in useInterview; all markup in src/screens.
export default function App() {
  const { user, authLoading } = useAuth()
  const { screen, setScreen, setup, interview, summary } = useInterview({ user, authLoading })

  // Where "Back" in History should go: the screen History was opened from.
  const returnScreenRef = useRef("setup")

  // While the user sits on the setup screen, quietly fetch the interview and summary chunks, so
  // pressing "Start interview" doesn't wait on the network. History is only fetched when opened.
  useEffect(() => {
    if (!user || screen !== "setup") return

    const prefetch = () => {
      loadInterviewScreen().catch(() => {})
      loadSummaryScreen().catch(() => {})
    }

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 1500)
    return () => clearTimeout(id)
  }, [user, screen])

  // Opening History from the summary remembers the summary, so Back returns there instead of
  // dropping the user on the setup screen. The summary data lives in useInterview, which stays
  // mounted, so nothing is lost while History is open.
  const openHistory = useCallback(() => {
    returnScreenRef.current = screen === "summary" ? "summary" : "setup"
    setScreen("history")
  }, [screen, setScreen])
  const closeHistory = useCallback(() => setScreen(returnScreenRef.current), [setScreen])

  if (authLoading) return <ScreenFallback />

  if (!user) return <Login />

  if (screen === "history") {
    // HistoryScreen renders the page's single <h1> (marked data-screen-heading, so ScreenFocus
    // moves focus to it once the lazy chunk has loaded).
    return (
      <div className="page page--history" key="history">
        <Header />
        <LazyScreen fallback={<InlineFallback />}>
          <HistoryScreen uid={user.uid} onBack={closeHistory} />
        </LazyScreen>
      </div>
    )
  }

  if (screen === "setup") {
    return (
      <div key="setup" style={{ display: "contents" }}>
        <SetupScreen setup={setup} onHistory={openHistory} />
        <ScreenFocus />
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <LazyScreen key="interview">
        <InterviewScreen interview={interview} />
      </LazyScreen>
    )
  }

  return (
    <LazyScreen key="summary">
      <SummaryScreen summary={summary} onHistory={openHistory} />
    </LazyScreen>
  )
}