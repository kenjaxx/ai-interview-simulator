// Turns a Firebase Auth error into a short message that is safe and useful to show on the login card.
// Returns null for errors that aren't worth showing (the user closed the popup on purpose).
export function messageForAuthError(err) {
  switch (err?.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again."
    case "auth/account-exists-with-different-credential":
      return "That email already has an account that uses a different sign-in method. Try another option."
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match. Try again, or reset your password."
    case "auth/email-already-in-use":
      return "That email already has an account. Sign in instead."
    case "auth/weak-password":
      return "Choose a password with at least 6 characters."
    case "auth/invalid-email":
      return "Enter a valid email address."
    case "auth/user-disabled":
      return "This account has been disabled."
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again."
    case "auth/network-request-failed":
      return "Couldn't reach the sign-in service. Check your connection and try again."
    case "auth/operation-not-allowed":
      return "This sign-in method isn't turned on yet. Enable it in the Firebase console."
    default:
      return "Sign-in failed. Please try again."
  }
}