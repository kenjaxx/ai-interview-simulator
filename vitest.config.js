import { defineConfig } from "vitest/config"

// Only pure-logic tests live here (fillers, scores, questions, rate limiting), so no browser
// environment is needed. If you later test React components, switch to "jsdom".
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "server/**/*.test.js"],
  },
})
