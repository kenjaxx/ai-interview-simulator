import { createContext, useContext, useEffect, useState, useCallback } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth"
import { auth, googleProvider } from "../../lib/firebase"
import { clearHistoryCache } from "../../lib/history"
import { messageForAuthError } from "../../lib/authErrors"

const AuthContext = createContext(null)

// Email + password accounts must confirm their address. Google accounts arrive already verified.
const needsVerification = (u) =>
  !!u && !u.emailVerified && u.providerData.some((p) => p.providerId === "password")

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  // Firebase mutates the same user object (updateProfile, reload), so React needs a nudge.
  const [, setTick] = useState(0)
  const bump = () => setTick((n) => n + 1)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const pending = needsVerification(firebaseUser)
  // The rest of the app only ever sees a verified user.
  const user = pending ? null : firebaseUser
  const pendingUser = pending ? firebaseUser : null

  const clearAuthError = useCallback(() => setAuthError(null), [])

  // Runs one auth action. Resolves to true on success, false on failure (message is in authError).
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
          } catch (err) {
            console.warn("Couldn't save the display name:", err)
          }
        }
        // The account exists now. If this fails, the verify screen has a Resend button.
        try {
          await sendEmailVerification(credential.user)
        } catch (err) {
          console.warn("Couldn't send the verification email:", err)
        }
        bump()
      }),
    [run]
  )

  const sendPasswordReset = useCallback((email) => run(() => sendPasswordResetEmail(auth, email)), [run])

  // Verify screen: send the link again.
  const resendVerification = useCallback(
    () =>
      run(async () => {
        if (!auth.currentUser) throw new Error("no user")
        await sendEmailVerification(auth.currentUser)
      }),
    [run]
  )

  // Verify screen: "I've verified". Reloads the user and refreshes the ID token, so the server and
  // Firestore rules see email_verified = true. Resolves to true once the address is confirmed.
  const checkVerification = useCallback(async () => {
    const u = auth.currentUser
    if (!u) return false
    setAuthError(null)
    try {
      await u.reload()
      if (u.emailVerified) await u.getIdToken(true)
    } catch (err) {
      console.error("Couldn't refresh the user:", err?.code || err)
      setAuthError(messageForAuthError(err))
      return false
    }
    bump()
    return u.emailVerified
  }, [])

  const signOutUser = useCallback(async () => {
    clearHistoryCache() // cached history belongs to the signed-in user
    await signOut(auth)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        pendingUser,
        authLoading,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        resendVerification,
        checkVerification,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}