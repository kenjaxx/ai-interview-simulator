// Daily limits reset at midnight UTC. These helpers say when that is in the user's own timezone.

export function nextUtcMidnight(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}

// e.g. "tomorrow at 8:00 AM your time (in about 3 h 12 min)"
export function resetPhrase(now = new Date()) {
  const next = nextUtcMidnight(now)
  const clock = next.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const day = next.toDateString() === now.toDateString() ? "today" : "tomorrow"
  return `${day} at ${clock} your time (in about ${formatDuration(next.getTime() - now.getTime())})`
}