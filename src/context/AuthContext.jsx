import { createContext, useContext, useEffect, useState, useCallback } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GithubAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth"
import { auth, googleProvider } from "../lib/firebase"
import { clearHistoryCache } from "../lib/history"
import { messageForAuthError } from "../lib/authErrors"

const AuthContext = createContext(null)

// Created once. "user:email" asks GitHub for the primary email so Header can show something readable.
const githubProvider = new GithubAuthProvider()
githubProvider.addScope("user:email")

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  // Bumped after updateProfile(): Firebase mutates the same user object, so React needs a nudge to
  // re-render consumers (like Header) with the new display name.
  const [, setProfileTick] = useState(0)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  // Runs one auth action. Resolves to true on success, false on failure (the message is in authError).
  const run = useCallback(async (action) => {
    setAuthError(null)
    try {
      await action()
      return true
    } catch (err) {
      console.error("Auth action failed:", err?.code || err)
      const message = messageForAuthError(err)
      if (message) setAuthError(message)
      return false
    }
  }, [])

  const signInWithGoogle = useCallback(() => run(() => signInWithPopup(auth, googleProvider)), [run])

  const signInWithGithub = useCallback(() => run(() => signInWithPopup(auth, githubProvider)), [run])

  const signInWithEmail = useCallback(
    (email, password) => run(() => signInWithEmailAndPassword(auth, email, password)),
    [run]
  )

  const signUpWithEmail = useCallback(
    ({ name, email, password }) =>
      run(async () => {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        if (name) {
          try {
            await updateProfile(credential.user, { displayName: name })
            setProfileTick((n) => n + 1)
          } catch (err) {
            // The account exists already; a missing display name isn't worth failing the sign-up.
            console.warn("Couldn't save the display name:", err)
          }
        }
      }),
    [run]
  )

  const sendPasswordReset = useCallback((email) => run(() => sendPasswordResetEmail(auth, email)), [run])

  const signOutUser = useCallback(async () => {
    // Cached history belongs to the signed-in user, so drop it on the way out.
    clearHistoryCache()
    await signOut(auth)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithGithub,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}