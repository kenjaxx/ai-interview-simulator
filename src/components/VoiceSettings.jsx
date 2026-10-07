import { ACCENTS, RATE_MIN, RATE_MAX, RATE_STEP } from "../lib/speechOptions"
import "./VoiceSettings.css"

const norm = (lang = "") => lang.toLowerCase().replace("_", "-")

// support: result of getSupport(). voices: SpeechSynthesisVoice[] from useTextToSpeech.
export default function VoiceSettings({
  support,
  lang,
  onLang,
  voices,
  voiceURI,
  onVoice,
  rate,
  onRate,
  onPreview,
}) {
  const english = voices.filter((v) => norm(v.lang).startsWith("en"))
  const wanted = norm(lang)
  // Voices that match the chosen accent come first.
  const sorted = [...english].sort(
    (a, b) =>
      Number(norm(b.lang) === wanted) - Number(norm(a.lang) === wanted) || a.name.localeCompare(b.name)
  )
  const selected = sorted.some((v) => v.voiceURI === voiceURI) ? voiceURI : ""

  return (
    <details className="voice-settings">
      <summary>
        Voice &amp; language <span className="jd-optional">(optional)</span>
      </summary>

      <div className="field">
        <label htmlFor="speech-lang">Your accent (for speech recognition)</label>
        <select
          id="speech-lang"
          value={lang}
          onChange={(e) => onLang(e.target.value)}
          disabled={!support.recognition}
        >
          {ACCENTS.map((a) => (
            <option key={a.code} value={a.code}>{a.label}</option>
          ))}
        </select>
        <p className="mode-notice">
          {support.recognition
            ? "Questions are asked in English, so only English accents are listed."
            : "Speech recognition isn't available in this browser, so this only applies when you can use voice."}
        </p>
      </div>

      {support.synthesis ? (
        <>
          <div className="field">
            <label htmlFor="tts-voice">Interviewer voice</label>
            <select id="tts-voice" value={selected} onChange={(e) => onVoice(e.target.value)}>
              <option value="">Browser default</option>
              {sorted.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tts-rate">Speaking speed</label>
            <div className="rate-row">
              <input
                id="tts-rate"
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={RATE_STEP}
                value={rate}
                onChange={(e) => onRate(Math.round(parseFloat(e.target.value) * 10) / 10)}
              />
              <span className="rate-value">{rate.toFixed(1)}×</span>
            </div>
          </div>

          <button type="button" className="secondary-btn voice-preview" onClick={onPreview}>
            Preview voice
          </button>
          <p className="mode-notice">
            Some voices don't report word timing. The orb then pulses on a timer instead.
          </p>
        </>
      ) : (
        <p className="mode-notice">This browser can't read questions aloud, so there are no voice options.</p>
      )}
    </details>
  )
}