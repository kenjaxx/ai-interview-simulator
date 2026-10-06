// Single source of truth for the interview options.
// Imported by the React app (src/App.jsx) AND the serverless function (api/evaluate.js),
// so the two can never drift apart.

export const ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst / Data Scientist",
  "QA / Test Engineer",
  "Tech Support / IT Support",
  "Product Manager",
  "UI/UX Designer",
]

export const SENIORITIES = ["Entry-level", "Mid-level", "Senior"]