import { readStored, writeStored } from "./Storage"

const THEME_KEY = "interview-ai-theme"

export function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

// Mirrors the inline script in index.html (used as a safety net).
export function initTheme() {
  const stored = readStored(THEME_KEY)
  const theme =
    stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia?.("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
  document.documentElement.dataset.theme = theme
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  writeStored(THEME_KEY, theme)
}
