import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"

// Firestore and App Check are intentionally NOT imported statically here.
//   - Firestore is heavy and only needed for saving and viewing history, so src/lib/history.js
//     loads "firebase/firestore" on demand with a dynamic import().
//   - App Check (plus the reCAPTCHA script it pulls in) is only needed when the app calls the API
//     or Firestore, so it is loaded after the first paint (see ensureAppCheck below).
// Both stay out of the main bundle. Auth stays here because the login screen needs it right away.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

// App Check is switched on by setting VITE_APPCHECK_SITE_KEY (a reCAPTCHA v3 site key registered in
// Firebase console > App Check). Without it the app still works and just sends no App Check token.
const APP_CHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY

let appCheckPromise = null

// Loads and initializes App Check once. Resolves to the App Check instance, or null if App Check
// isn't configured or failed to start. Never rejects.
// Anything that talks to Firebase services that enforce App Check (Firestore, the API) should
// await this first, so the token provider exists before the first request.
export function ensureAppCheck() {
  if (!APP_CHECK_SITE_KEY) return Promise.resolve(null)

  if (!appCheckPromise) {
    appCheckPromise = import("firebase/app-check")
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
        // localhost isn't a real attested origin. In dev, Firebase prints a debug token in the
        // browser console; register it under App Check > Apps > Manage debug tokens. (Or set
        // VITE_APPCHECK_DEBUG_TOKEN to reuse one you already registered.) This MUST be set before
        // initializeAppCheck() runs.
        if (import.meta.env.DEV) {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
        }
        return initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        })
      })
      .catch((err) => {
        console.warn("Couldn't start App Check:", err)
        appCheckPromise = null // allow a later call to try again
        return null
      })
  }
  return appCheckPromise
}

// Start App Check once the page has settled, so it doesn't compete with first paint. If it is
// needed sooner (an API call right away), ensureAppCheck() simply joins the same load.
if (APP_CHECK_SITE_KEY && typeof window !== "undefined") {
  const warmUp = () => {
    ensureAppCheck()
  }
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warmUp, { timeout: 3000 })
  } else {
    setTimeout(warmUp, 1500)
  }
}

// Returns a fresh-enough App Check token, or null if App Check isn't configured or failed.
// Never throws: the server decides whether a missing token is acceptable.
export async function getAppCheckToken() {
  const appCheck = await ensureAppCheck()
  if (!appCheck) return null
  try {
    const { getToken } = await import("firebase/app-check")
    const { token } = await getToken(appCheck, /* forceRefresh */ false)
    return token
  } catch (err) {
    console.warn("Couldn't get an App Check token:", err)
    return null
  }
}

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()