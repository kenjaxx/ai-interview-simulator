# AI Interview Coach

A voice-driven mock interview. Answer out loud (or type), then get scored on content, clarity and
confidence, with STAR checks, optional AI follow-up questions and sample answers.

- **Practice Mode**: scored locally from speech metrics, unlimited, no AI request used.
- **Full AI Mode**: scored by Gemini through a serverless function (daily limit per user).

## Stack

React + Vite, Firebase (Auth, Firestore, App Check), a Vercel serverless function (`api/evaluate.js`),
Upstash Redis for rate limits, Google Gemini for evaluation.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Firebase keys (see below)
```

| Command           | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `npm run dev`     | Frontend only. `/api` is NOT served, so use mock mode (below).       |
| `vercel dev`      | Frontend **and** the `api/` function. Use this to test real AI.      |
| `npm run build`   | Production build into `dist/`.                                       |
| `npm run preview` | Serve the production build locally.                                  |
| `npm test`        | Run the unit tests once (`npm run test:watch` to keep them running). |
| `npm run lint`    | ESLint.                                                              |
| `npm run format`  | Prettier.                                                            |

Set `VITE_MOCK_AI=true` in `.env` to skip the backend entirely (instant fake AI responses, zero quota).

## Environment variables

Client (`.env`, prefixed `VITE_`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_APP_ID`, optional `VITE_APPCHECK_SITE_KEY`, `VITE_APPCHECK_DEBUG_TOKEN`, `VITE_MOCK_AI`.

Server (Vercel project settings): `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`, `FIREBASE_PROJECT_NUMBER`,
`APP_CHECK_ENFORCE`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_DAILY`, `RATE_LIMIT_BURST`, `RATE_LIMIT_GLOBAL_DAILY`,
`RATE_LIMIT_REFUND_CAP`.

## Project layout

```
api/evaluate.js        Vercel handler only: auth, pick an action, refund on failure
server/                Everything the handler uses
  settings.js            env vars, model names, time budget
  auth.js                Firebase ID token + App Check verification
  validate.js            input validation
  prompts.js             Gemini prompts and response schemas
  gemini.js              Gemini calls with timeout, retry, fallback model
  parse.js               turn Gemini output into safe, clamped data
  actions.js             usage / questions / followup / evaluate
  rateLimit.js           per-user and global limits (Upstash Redis)
shared/                Code imported by BOTH the app and the server
  options.js             roles and seniorities
  limits.js              size limits
src/
  screens/               Setup, Interview and Summary screens
  components/            Reusable UI pieces
  hooks/                 useInterview (conductor) + useQuota, useSetupForm, useSpeechIO,
                         useSessionSave, useFollowUps, useRetryFlow, useHistory, ...
  lib/                   Pure logic: scoring, fillers, question picking, Gemini client, history, PDF
  lib/types.js           JSDoc shapes for sessions, evaluations and quota
```

## Keeping things in sync

`firestore.rules` can't import code. If you change a limit marked `[rules]` in `shared/limits.js`,
update `firestore.rules` too.
