// localStorage can throw: Safari private mode (older versions), blocked site data, a full quota,
// or sandboxed iframes. These wrappers never throw, so a storage problem can't crash the app,
// even when called from a useState initializer on first render.

export function readStored(key, fallback = null) {
  try {
    if (typeof window === "undefined") return fallback
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

export function writeStored(key, value) {
  try {
    if (typeof window === "undefined") return false
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false // preference just won't persist; nothing else depends on it
  }
}
