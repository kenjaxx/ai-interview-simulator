import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist", "stats.html"]),
  {
    files: ["src/**/*.{js,jsx}"],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Strict React Compiler checks. The app doesn't use the compiler, and these patterns
      // (refs passed into handler factories, fetch-on-mount effects) are intentional.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Serverless function, server helpers, shared code and tool configs run in Node, not the browser.
    files: ["api/**/*.js", "server/**/*.js", "shared/**/*.js", "*.config.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
])