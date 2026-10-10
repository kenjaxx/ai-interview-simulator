import { describe, it, expect } from "vitest"
import { sanitizeRole, MAX_ROLE_CHARS } from "../../shared/options.js"

describe("sanitizeRole", () => {
  it("returns an empty string for non-strings", () => {
    expect(sanitizeRole(undefined)).toBe("")
    expect(sanitizeRole(42)).toBe("")
  })

  it("collapses whitespace and trims", () => {
    expect(sanitizeRole("  QA   Lead ")).toBe("QA Lead")
  })

  it("removes angle brackets, quotes and line breaks", () => {
    expect(sanitizeRole("Site <Reliability> Engineer")).toBe("Site Reliability Engineer")
    expect(sanitizeRole('Lead "Ninja"\nDeveloper')).toBe("Lead Ninja Developer")
  })

  it("keeps ordinary role punctuation", () => {
    expect(sanitizeRole("Data Analyst / BI (Senior), C++")).toBe("Data Analyst / BI (Senior), C++")
  })

  it("caps the length", () => {
    expect(sanitizeRole("a".repeat(200))).toHaveLength(MAX_ROLE_CHARS)
  })
})