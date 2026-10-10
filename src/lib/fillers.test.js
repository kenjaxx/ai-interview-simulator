import { describe, it, expect } from "vitest"
import { countFillers, findFillers, splitByFillers } from "./fillers"

describe("countFillers", () => {
  it("returns 0 for empty input", () => {
    expect(countFillers("")).toBe(0)
    expect(countFillers(null)).toBe(0)
  })

  it("counts clear fillers at full weight", () => {
    expect(countFillers("um um um")).toBe(3)
    expect(countFillers("uh and erm")).toBe(2)
  })

  it("adds up weighted fillers", () => {
    // um (1) + like (0.25) + you know (0.5) + basically (0.5) = 2.25 -> 2
    expect(countFillers("um, I was like, you know, basically fine")).toBe(2)
  })

  it("ignores legitimate uses of 'like'", () => {
    expect(countFillers("I would like to apply")).toBe(0)
    expect(countFillers("it looks like rain")).toBe(0)
  })

  it("ignores 'kind of' used as a noun phrase", () => {
    expect(countFillers("what kind of project was it")).toBe(0)
  })

  it("does not need regex lookbehind support", () => {
    // Guards the Safari fix: the module must load and run without lookbehind syntax.
    expect(() => countFillers("kind of like a thing")).not.toThrow()
  })
})

describe("findFillers / splitByFillers", () => {
  it("returns no ranges when there are no fillers", () => {
    expect(findFillers("I led the migration")).toEqual([])
  })

  it("marks only the filler and keeps the original text intact", () => {
    const text = "I would like um this"
    const parts = splitByFillers(text)

    expect(parts.map((p) => p.text).join("")).toBe(text)
    expect(parts).toEqual([
      { text: "I would like ", filler: false },
      { text: "um", filler: true },
      { text: " this", filler: false },
    ])
  })

  it("marks a sentence-opening 'so' without highlighting the punctuation before it", () => {
    const parts = splitByFillers("So I did it")
    expect(parts[0]).toEqual({ text: "So", filler: true })
  })

  it("handles empty text", () => {
    expect(splitByFillers("")).toEqual([{ text: "", filler: false }])
  })
})
