import { describe, it, expect } from "vitest"
import { messageForAuthError } from "../lib/AuthErrors"

describe("messageForAuthError", () => {
  it("stays silent when the user closes the popup", () => {
    expect(messageForAuthError({ code: "auth/popup-closed-by-user" })).toBeNull()
    expect(messageForAuthError({ code: "auth/cancelled-popup-request" })).toBeNull()
  })

  it("gives one message for every wrong-credentials code, so it never reveals which part was wrong", () => {
    const codes = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"]
    const messages = new Set(codes.map((code) => messageForAuthError({ code })))
    expect(messages.size).toBe(1)
  })

  it("explains an email that is already registered", () => {
    expect(messageForAuthError({ code: "auth/email-already-in-use" })).toMatch(/Sign in instead/)
  })

  it("falls back to a generic message for unknown errors", () => {
    expect(messageForAuthError({ code: "auth/something-new" })).toBe("Sign-in failed. Please try again.")
    expect(messageForAuthError(undefined)).toBe("Sign-in failed. Please try again.")
  })
})