import { useEffect } from "react"
import Header from "./components/Header"
import Login from "./components/Login"
import HistoryScreen from "./components/HistoryScreen"
import SetupScreen from "./screens/SetupScreen"
import InterviewScreen from "./screens/InterviewScreen"
import SummaryScreen from "./screens/SummaryScreen"
import { useAuth } from "./context/AuthContext"
import { useInterview } from "./hooks/useInterview"
import "./App.css"
import "./ui-extras.css"

// Decides which screen to show. All interview logic lives in useInterview; all markup in src/screens.
export default function App() {
  const { user, authLoading } = useAuth()
  const { screen, setScreen, setup, interview, summary } = useInterview({ user, authLoading })

  // On every screen change: scroll to the top and move focus to the new screen's heading,
  // so keyboard and screen-reader users aren't left on a button that no longer exists.
  // If a text box already grabbed focus (the typing panel), leave it there.
  useEffect(() => {
    if (authLoading) return
    window.scrollTo({ top: 0 })
    const active = document.activeElement
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return
    document.querySelector("[data-screen-heading]")?.focus({ preventScroll: true })
  }, [screen, user, authLoading])

  if (authLoading) {
    return (
      <div className="page-loading" role="status" aria-label="Loading">
        <div className="page-loading-spinner" />
      </div>
    )
  }

  if (!user) return <Login />

  const openHistory = () => setScreen("history")

  if (screen === "history") {
    return (
      <div className="page">
        <Header />
        <h2 className="sr-only" tabIndex={-1} data-screen-heading>
          Session history
        </h2>
        <HistoryScreen uid={user.uid} onBack={() => setScreen("setup")} />
      </div>
    )
  }

  if (screen === "setup") return <SetupScreen setup={setup} onHistory={openHistory} />
  if (screen === "interview") return <InterviewScreen interview={interview} />
  return <SummaryScreen summary={summary} onHistory={openHistory} />
}
