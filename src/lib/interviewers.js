
 // The interviewers a user can pick on the setup screen. Each one has a look and a voice:
//   skin, hair, blazer ...  colors for the face drawing (fixed, so they read well in both themes)
//   voice.names             the exact text-to-speech voices wanted, best first
//   voice.lang              the accent, used to find a stand-in when those voices aren't installed
//   voice.gender            "male" | "female", so a stand-in still sounds right
//   voice.rate              optional speaking speed (1 = normal)
//   voice.pitch             optional pitch adjustment for stand-in voices (1 = normal)
// Which voices exist depends on the browser and operating system, see voices.js.

export const INTERVIEWERS = [
  {
    id: "alex",
    name: "Alex",
    skin: "#e8b894",
    neck: "#d9a67e",
    hair: "#2b2438",
    hairStyle: "short",
    blazer: "#3C3489",
    shirt: "#EEEDFE",
    bg: "#2a2540",
    voice: {
      names: ["Google UK English Male"],
      lang: "en-GB",
      gender: "male",
      rate: 1,
      pitch: 0.95,
    },
  },
  {
    id: "maya",
    name: "Maya",
    skin: "#f0c4a0",
    neck: "#dfae88",
    hair: "#5a3a22",
    hairStyle: "long",
    blazer: "#0F6E56",
    shirt: "#E1F5EE",
    bg: "#16302b",
    voice: {
      names: ["Google UK English Female"],
      lang: "en-GB",
      gender: "female",
      rate: 1,
      pitch: 1.05,
    },
  },
  {
    id: "daniel",
    name: "Daniel",
    skin: "#c68642",
    neck: "#b3743a",
    hair: "#1c1b25",
    hairStyle: "short",
    blazer: "#993C1D",
    shirt: "#FAECE7",
    bg: "#3a2119",
    voice: {
      names: ["Microsoft Mark - English (United States)", "Microsoft Mark"],
      lang: "en-US",
      gender: "male",
      rate: 1,
      pitch: 0.8,
    },
  },
  {
    id: "aiko",
    name: "Aiko",
    skin: "#f1c9a5",
    neck: "#e0b690",
    hair: "#1c1b25",
    hairStyle: "bob",
    blazer: "#185FA5",
    shirt: "#E6F1FB",
    bg: "#16283d",
    voice: {
      names: ["Google US English"],
      lang: "en-US",
      gender: "female",
      rate: 1,
      pitch: 1,
    },
  },
]

export const DEFAULT_INTERVIEWER = INTERVIEWERS[0].id

export const isInterviewerId = (id) => INTERVIEWERS.some((p) => p.id === id)

// Always returns an interviewer, so a stale or tampered stored id can never crash the screen.
export function getInterviewer(id) {
  return INTERVIEWERS.find((p) => p.id === id) ?? INTERVIEWERS[0]
}
