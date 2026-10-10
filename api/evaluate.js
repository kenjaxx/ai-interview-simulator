import { PROJECT_ID, GEMINI_API_KEY, PROJECT_NUMBER, APP_CHECK_ENFORCE } from "../server/settings.js"
import { HttpError } from "../server/errors.js"
import { verifyAppCheck, verifyUser } from "../server/auth.js"
import { reserveRequest } from "../server/reserve.js"
import { usageAction, questionsAction, followUpAction, evaluateAction } from "../server/actions.js"

export const config = { maxDuration: 60 }

// Anything not listed here is treated as "evaluate": score a set of answers.
const ACTIONS = {
  usage: usageAction,
  questions: questionsAction,
  followup: followUpAction,
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed." })
  }

  let reservation = null

  try {
    if (!PROJECT_ID || !GEMINI_API_KEY) {
      console.error("Missing FIREBASE_PROJECT_ID or GEMINI_API_KEY env var")
      throw new HttpError(500, "Server is not configured.")
    }
    if ((APP_CHECK_ENFORCE || req.headers["x-firebase-appcheck"]) && !PROJECT_NUMBER) {
      console.error("Missing FIREBASE_PROJECT_NUMBER env var (needed for App Check)")
      throw new HttpError(500, "Server is not configured.")
    }

    // Order matters for cost: cheap checks first, quota is only spent once the request is valid.
    await verifyAppCheck(req)
    const uid = await verifyUser(req)

    const action = req.body?.action
    const run =
      typeof action === "string" && Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : evaluateAction

    // Kept in this scope so the catch block below can refund it if the action fails.
    const reserve = async () => {
      reservation = await reserveRequest(uid)
      return reservation
    }

    const payload = await run({ uid, body: req.body, reserve })
    return res.status(200).json(payload)
  } catch (err) {
    let refunded = false
    if (reservation && err instanceof HttpError && err.refund) {
      refunded = await reservation.refund({ capped: err.refund === "capped" })
    }

    if (err instanceof HttpError) {
      if (err.extra.retryAfterSeconds) res.setHeader("Retry-After", String(err.extra.retryAfterSeconds))
      return res.status(err.status).json({ error: err.message, ...err.extra, refunded })
    }
    console.error("Unexpected error", err)
    // An unexpected server-side crash after we reserved a request: the user got nothing.
    if (reservation) await reservation.refund({ capped: true })
    return res.status(500).json({ error: "Something went wrong." })
  }
}
