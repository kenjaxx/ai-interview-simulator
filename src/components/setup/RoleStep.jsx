import { ROLES, SENIORITIES, CUSTOM_ROLE, MAX_ROLE_CHARS, MIN_ROLE_CHARS } from "../../lib/Options"

// Step 1: target role (a preset or your own), and seniority.
export default function RoleStep({ setup }) {
  const custom = setup.role === CUSTOM_ROLE
  const typed = setup.customRole.trim().length > 0

  return (
    <>
      <div className="field">
        <label htmlFor="role">Target role</label>
        <select
          id="role"
          value={setup.role}
          onChange={(e) => setup.setRole(e.target.value)}
          disabled={setup.starting}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={CUSTOM_ROLE}>Other (type your own)…</option>
        </select>
      </div>

      {custom && (
        <div className="field">
          <label htmlFor="custom-role">Your role</label>
          <input
            id="custom-role"
            type="text"
            value={setup.customRole}
            onChange={(e) => setup.setCustomRole(e.target.value)}
            placeholder="e.g. Site Reliability Engineer"
            maxLength={MAX_ROLE_CHARS}
            autoComplete="off"
            disabled={setup.starting}
            aria-describedby="custom-role-hint"
            aria-invalid={typed && !setup.roleReady}
          />
          <p
            className={`mode-notice ${typed && !setup.roleReady ? "mode-notice--warn" : ""}`}
            id="custom-role-hint"
          >
            {typed && !setup.roleReady
              ? `Use at least ${MIN_ROLE_CHARS} letters or numbers.`
              : "Full AI Mode uses this to judge your answers and write follow-ups. The built-in question bank has no questions for custom roles, so you'll get general ones. Paste a job description in Full AI Mode for tailored questions."}
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="seniority">Seniority</label>
        <select
          id="seniority"
          value={setup.seniority}
          onChange={(e) => setup.setSeniority(e.target.value)}
          disabled={setup.starting}
        >
          {SENIORITIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
    </>
  )
}