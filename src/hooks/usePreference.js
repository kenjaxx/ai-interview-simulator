import { useState, useCallback } from "react"
import { readStored, writeStored } from "../lib/Storage"

// A useState that remembers its value in localStorage (as JSON). `isValid` rejects stale or
// tampered values and falls back to the default.
export function usePreference(key, fallback, isValid = () => true) {
  const [value, setValue] = useState(() => {
    const raw = readStored(key)
    if (raw === null) return fallback
    try {
      const parsed = JSON.parse(raw)
      return isValid(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  })

  const update = useCallback(
    (next) => {
      setValue(next)
      writeStored(key, JSON.stringify(next))
    },
    [key]
  )

  return [value, update]
}