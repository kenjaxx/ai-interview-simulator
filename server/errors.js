// What to do with the user's reserved evaluation when a request fails:
//   refund: "always" - clear provider-side failure, the user got nothing and it wasn't their doing
//   refund: "capped" - ambiguous failure (timeout, cut-off or unreadable output). Refunded, but only
//                      up to a small daily cap per user, so crafted input can't farm free requests
//   refund: null     - the user's own doing (bad input, blocked content): no refund
export class HttpError extends Error {
  constructor(status, message, extra = {}, { refund = null, retryable = false, retryDelaySec = null } = {}) {
    super(message)
    this.status = status
    this.extra = extra
    this.refund = refund
    this.retryable = retryable // worth one more attempt (on the fallback model if there is one)
    this.retryDelaySec = retryDelaySec
  }
}
