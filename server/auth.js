import { createRemoteJWKSet, jwtVerify } from "jose"
import { PROJECT_ID, PROJECT_NUMBER, APP_CHECK_ENFORCE } from "./settings.js"
import { HttpError } from "./errors.js"

// Google's public keys for verifying Firebase ID tokens
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
)
// ...and for verifying App Check tokens
const APP_CHECK_JWKS = createRemoteJWKSet(new URL("https://firebaseappcheck.googleapis.com/v1/jwks"))

// App Check proves the request comes from your real, attested web app and not a script that
// replays a stolen Firebase login token.
export async function verifyAppCheck(req) {
  const raw = req.headers["x-firebase-appcheck"]
  const token = typeof raw === "string" && raw ? raw : null

  if (!token) {
    if (APP_CHECK_ENFORCE) {
      throw new HttpError(403, "This request couldn't be verified. Please reload the page and try again.")
    }
    return
  }

  try {
    await jwtVerify(token, APP_CHECK_JWKS, {
      issuer: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
      audience: `projects/${PROJECT_NUMBER}`,
      algorithms: ["RS256"],
    })
  } catch (err) {
    if (APP_CHECK_ENFORCE) {
      throw new HttpError(403, "This request couldn't be verified. Please reload the page and try again.")
    }
    console.warn("[appCheck] invalid token (monitor mode, not blocking):", err.message)
  }
}

// Returns the signed-in user's uid, or throws a 401.
export async function verifyUser(req) {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) throw new HttpError(401, "You must be signed in.")

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ["RS256"],
    })
    if (!payload.sub) throw new Error("missing sub")
    return payload.sub // the user's uid
  } catch {
    throw new HttpError(401, "Your session expired. Please sign out and sign in again.")
  }
}
