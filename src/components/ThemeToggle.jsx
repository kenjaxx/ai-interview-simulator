import { useState } from "react"
import { getTheme, setTheme } from "../lib/theme"
import "./ThemeToggle.css"

export default function ThemeToggle({ className = "" }) {
  const [theme, setThemeState] = useState(getTheme)
  const next = theme === "light" ? "dark" : "light"

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next)
        setThemeState(next)
      }}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  )
}
