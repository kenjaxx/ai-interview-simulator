const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = "gemini-2.5-flash"
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

async function callGemini(systemPrompt, userPrompt, expectJson = false) {
  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: expectJson ? { responseMimeType: "application/json" } : {},
  }

  const res = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error("No response text from Gemini")
  return text
}

// Generates the next interview question, adapting to what's been said so far
export async function generateNextQuestion({ role, seniority, history }) {
  const systemPrompt = `You are an experienced technical interviewer conducting a mock interview for a ${seniority} ${role} position. Ask one question at a time. If the candidate's previous answer mentioned a specific project, technology, or claim, ask a natural follow-up probing deeper into it. Otherwise, move to a new relevant topic. Keep questions concise, like a real interviewer would ask out loud. Do not number the questions or add preamble - just ask the question directly.`

  const historyText = history.length === 0
    ? "This is the first question of the interview."
    : history.map(h => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n")

  const question = await callGemini(systemPrompt, historyText)
  return question.trim()
}

// Evaluates a candidate's answer, combining AI judgment with objective metrics we computed ourselves
export async function evaluateAnswer({ question, answer, metrics }) {
  const systemPrompt = `You are an interview coach evaluating a candidate's spoken answer. You will receive the question, the transcribed answer, and objective speech metrics that were already computed (do not recompute them, just factor them into your feedback). Return ONLY valid JSON matching this exact shape, no markdown formatting:
{
  "contentScore": <0-100 integer, how relevant and well-structured the answer content was>,
  "clarityScore": <0-100 integer, based on structure and the provided metrics>,
  "confidenceScore": <0-100 integer, based on pacing and filler word rate from metrics>,
  "feedback": "<2-3 sentences of specific, constructive feedback>",
  "improvementTip": "<one concrete, actionable tip>"
}`

  const userPrompt = `Question: ${question}\n\nAnswer transcript: ${answer}\n\nSpeech metrics:\n- Filler words: ${metrics.fillerCount}\n- Words per minute: ${metrics.wpm}\n- Response delay: ${metrics.responseDelaySec}s`

  const jsonText = await callGemini(systemPrompt, userPrompt, true)
  return JSON.parse(jsonText)
}