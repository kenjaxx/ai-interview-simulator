import { useState } from "react"
import {
  ACCENTS,
  RATE_MIN,
  RATE_MAX,
  RATE_STEP,
  normLang,
  voicesForAccent,
  bestVoiceForAccent,
} from "../lib/speechOptions"
import "./VoiceSettings.css"

// support:         result of getSupport()
// lang:            the chosen accent code, e.g. "en-AU"
// onSelectAccent:  (code) => void   picks the accent AND resets to the automatic voice for it
// voices:          SpeechSynthesisVoice[] from useTextToSpeech
// voiceURI:        a manually chosen voice, or "" for automatic
// onPreviewAccent: (code, onEnd) => void
// onPreviewVoice:  (onEnd) => void   previews the current accent / voice / speed settings
// onStopPreview:   () => void
export default function VoiceSettings({
  support,
  lang,
  onSelectAccent,
  voices,
  voiceURI,
  onVoice,
  rate,
  onRate,
  onPreviewAccent,
  onPreviewVoice,
  onStopPreview,
}) {
  // Which preview is playing: an accent code, "voice", or null.
  const [playing, setPlaying] = useState(null)

  const play = (key, start) => {
    if (playing === key) {
      onStopPreview()
      setPlaying(null)
      return
    }
    setPlaying(key)
    // Clears the button when speech ends, unless another preview has taken over by then.
    start(() => setPlaying((current) => (current === key ? null : current)))
  }

  const english = voices.filter((v) => normLang(v.lang).startsWith("en"))
  const matching = voicesForAccent(voices, lang)
  const others = english.filter((v) => !matching.includes(v)).sort((a, b) => a.name.localeCompare(b.name))
  const selected = english.some((v) => v.voiceURI === voiceURI) ? voiceURI : ""
  const autoVoice = bestVoiceForAccent(voices, lang)
  const currentAccent = ACCENTS.find((a) => a.code === lang)

  return (
    <details className="voice-settings">
      <summary>
        Accent &amp; voice{" "}
        <span className="jd-optional">({currentAccent ? currentAccent.label : "optional"})</span>
      </summary>

      <div className="field">
        <span className="field-label" id="accent-label">
          Your accent
        </span>
        <p className="mode-notice" style={{ marginTop: 0 }}>
          Used for speech recognition and for the interviewer's voice. Press ▶ to hear each one. Which voices
          exist depends on your device and browser.
        </p>

        <div className="accent-list" role="radiogroup" aria-labelledby="accent-label">
          {ACCENTS.map((a) => {
            const matches = voicesForAccent(voices, a.code)
            const best = matches[0]
            const active = a.code === lang

            let status = ""
            let tone = "none"
            if (!support.synthesis) {
              status = "Voice preview isn't available in this browser"
            } else if (voices.length === 0) {
              status = "Checking for voices…"
            } else if (best) {
              tone = "ok"
              status = `✓ ${best.name}${matches.length > 1 ? ` (+${matches.length - 1} more)` : ""}`
            } else {
              status = "No voice on this device, so the default English voice is used"
            }

            return (
              <div key={a.code} className={`accent-row ${active ? "accent-row--on" : ""}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className="accent-pick"
                  onClick={() => onSelectAccent(a.code)}
                >
                  <span className="accent-radio" aria-hidden="true" />
                  <span className="accent-text">
                    <span className="accent-name">{a.label}</span>
                    <span className={`accent-status accent-status--${tone}`}>{status}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="secondary-btn accent-play"
                  onClick={() => play(a.code, (done) => onPreviewAccent(a.code, done))}
                  disabled={!support.synthesis}
                  aria-label={`${playing === a.code ? "Stop" : "Preview"} ${a.label}`}
                >
                  {playing === a.code ? "■ Stop" : "▶ Preview"}
                </button>
              </div>
            )
          })}
        </div>

        {!support.recognition && (
          <p className="mode-notice">
            Speech recognition isn't available in this browser, so the accent only changes the interviewer's
            voice here. Typing works as normal.
          </p>
        )}
      </div>

      {support.synthesis ? (
        <>
          <div className="field">
            <label htmlFor="tts-voice">Interviewer voice</label>
            <select id="tts-voice" value={selected} onChange={(e) => onVoice(e.target.value)}>
              <option value="">
                {autoVoice ? `Automatic (${autoVoice.name})` : "Automatic (browser default)"}
              </option>
              {matching.length > 0 && (
                <optgroup label="Matches your accent">
                  {matching.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other English voices">
                  {others.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </optgroup>
              )}
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

          <button
            type="button"
            className="secondary-btn voice-preview"
            onClick={() => play("voice", (done) => onPreviewVoice(done))}
          >
            {playing === "voice" ? "■ Stop" : "▶ Preview my settings"}
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
