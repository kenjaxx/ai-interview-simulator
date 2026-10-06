import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check"

// Firestore is intentionally NOT imported here. It is heavy and only needed for saving and viewing
// history, so src/lib/history.js loads "firebase/firestore" on demand with a dynamic import().
// That keeps it out of the main bundle.

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

// localhost isn't a real attested origin. In dev, Firebase prints a debug token in the browser
// console; register it under App Check > Apps > Manage debug tokens. (Or set
// VITE_APPCHECK_DEBUG_TOKEN to reuse one you already registered.) This MUST be set before
// initializeAppCheck() runs.
if (APP_CHECK_SITE_KEY && import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
}

export const appCheck = APP_CHECK_SITE_KEY
  ? initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  : null

// Returns a fresh-enough App Check token, or null if App Check isn't configured or failed.
// Never throws: the server decides whether a missing token is acceptable.
export async function getAppCheckToken() {
  if (!appCheck) return null
  try {
    const { token } = await getToken(appCheck, /* forceRefresh */ false)
    return token
  } catch (err) {
    console.warn("Couldn't get an App Check token:", err)
    return null
  }
}

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()