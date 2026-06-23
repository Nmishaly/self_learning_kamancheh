import { useCallback, useEffect, useRef, useState } from 'react'
import { usePitchDetector } from '../audio/usePitchDetector.js'
import { centsBetween, centsToColor } from '../audio/pitch.js'
import './SongInstructor.css'

// ── Tuning / technique thresholds ──────────────────────────────────────────
const IN_TUNE_CENTS = 15 // within this counts as "on the note"
const STABILITY_MS = 900 // must hold a clean pitch this long to pass (Stability)
const LEGATO_RMS_FLOOR = 0.02 // below this the bow envelope has effectively dropped
const SILENT_CENTS = 60 // forces a red glow while no note is sounding

// ── Mock asset: the "Ajam / Mahur" scale on D, as demonstrated by the teacher ──
// Each step ties a timeline slot to a target frequency, a string + finger on the
// Kamancheh, a primary technique to focus on, and a Hebrew instruction.
// Fingering ascends the D4 string (Open→Pinky) then the A4 string (1→3).
const SCALE = [
  {
    id: 'step-1', solfege: 'Re', english: 'D', frequency: 293.66,
    string: 'D4', finger: 'Open', technique: 'stability',
    hebrew: 'מיתר רֶה פתוח — משכו קשת ארוכה ויציבה, בלי רעידות.',
  },
  {
    id: 'step-2', solfege: 'Mi', english: 'E', frequency: 329.63,
    string: 'D4', finger: '1', technique: 'legato',
    hebrew: 'אצבע 1 — מי בֵּקאר. חַברו מהרֶה בלגאטו, בלי להרים את הקשת.',
  },
  {
    id: 'step-3', solfege: 'Fa#', english: 'F#', frequency: 369.99,
    string: 'D4', finger: '2', technique: 'legato',
    hebrew: 'אצבע 2 — פה דיאז. שמרו על רצף הצליל מהמי.',
  },
  {
    id: 'step-4', solfege: 'Sol', english: 'G', frequency: 392.0,
    string: 'D4', finger: '3', technique: 'legato',
    hebrew: 'אצבע 3 — סול. מעבר חלק, בלי הפסקה בקשת.',
  },
  {
    id: 'step-5', solfege: 'La', english: 'A', frequency: 440.0,
    string: 'D4', finger: 'Pinky', technique: 'stability',
    hebrew: 'זֶרֶת (אצבע 4) — לָה. הניחו את הזרת בעדינות ושמרו על יציבות.',
  },
  {
    id: 'step-6', solfege: 'Si', english: 'B', frequency: 493.88,
    string: 'A4', finger: '1', technique: 'legato',
    hebrew: 'עברו למיתר לָה. אצבע 1 — סי בֵּקאר, בתנועה רציפה.',
  },
  {
    id: 'step-7', solfege: 'Do', english: 'C', frequency: 523.25,
    string: 'A4', finger: '2', technique: 'stability',
    hebrew: 'אצבע 2 — דו. צליל נקי ויציב, הקשיבו לאינטונציה.',
  },
  {
    id: 'step-8', solfege: 'Re', english: 'D', frequency: 587.33,
    string: 'A4', finger: '3', technique: 'stability',
    hebrew: 'אצבע 3 — רֶה עליון. סיימו את הסולם בצליל ארוך ויציב.',
  },
]

// The four open strings, drawn high → low. Each shows the five finger slots.
const STRINGS = [
  { id: 'D5', solfege: 'Re' },
  { id: 'A4', solfege: 'La' },
  { id: 'D4', solfege: 'Re' },
  { id: 'A3', solfege: 'La' },
]
const FINGERS = [
  { id: 'Open', label: 'O', name: 'Open' },
  { id: '1', label: '1', name: 'Finger 1' },
  { id: '2', label: '2', name: 'Finger 2' },
  { id: '3', label: '3', name: 'Finger 3' },
  { id: 'Pinky', label: 'ז', name: 'Pinky / Azeret' },
]

/**
 * Stage 4 song instructor: walks the player through a scale with Hebrew
 * pedagogical cues, a string/finger map, and live audio validation of
 * Stability (sustained clean pitch) and Legato (no envelope drop between notes).
 *
 * Props: stage, onComplete(stageId), onExit().
 */
export default function SongInstructor({ stage, onComplete, onExit }) {
  const [index, setIndex] = useState(0)
  const [liveCents, setLiveCents] = useState(null) // null = silent
  const [stability, setStability] = useState(0) // 0..1 progress
  const [legatoBroken, setLegatoBroken] = useState(false)
  const [results, setResults] = useState([]) // { legato: bool|null } per passed note

  const finished = index >= SCALE.length
  const step = finished ? null : SCALE[index]

  // Per-note bookkeeping kept in refs so the rAF loop is render-independent.
  const indexRef = useRef(0)
  const holdMsRef = useRef(0)
  const passedRef = useRef(false)
  const legatoBrokenRef = useRef(false)
  const lastTsRef = useRef(0)

  // Reset tracking whenever the active note changes.
  useEffect(() => {
    indexRef.current = index
    holdMsRef.current = 0
    passedRef.current = false
    legatoBrokenRef.current = false
    lastTsRef.current = 0
    setStability(0)
    setLegatoBroken(false)
    setLiveCents(null)
  }, [index])

  const handleFrame = useCallback(({ frequency, rms, timestamp }) => {
    const current = SCALE[indexRef.current]
    if (!current) return

    const dt = lastTsRef.current ? timestamp - lastTsRef.current : 0
    lastTsRef.current = timestamp

    // Silence: the audio envelope dropped to zero — this breaks Legato and
    // resets the Stability hold.
    if (frequency === -1) {
      legatoBrokenRef.current = true
      holdMsRef.current = 0
      setLegatoBroken(true)
      setStability(0)
      setLiveCents(null)
      return
    }

    // A near-silent dip (quiet but not fully silent) also breaks Legato.
    if (rms < LEGATO_RMS_FLOOR) {
      legatoBrokenRef.current = true
      setLegatoBroken(true)
    }

    const cents = centsBetween(frequency, current.frequency)
    setLiveCents(cents)

    // Stability: accumulate continuous in-tune time.
    if (Math.abs(cents) <= IN_TUNE_CENTS) {
      holdMsRef.current += dt
    } else {
      holdMsRef.current = 0
    }
    const progress = Math.min(holdMsRef.current / STABILITY_MS, 1)
    setStability(progress)

    if (progress >= 1 && !passedRef.current) {
      passedRef.current = true
      // The first note has no preceding note to connect from.
      const legato = indexRef.current === 0 ? null : !legatoBrokenRef.current
      setResults((prev) => [...prev, { legato }])
      setIndex((i) => i + 1)
    }
  }, [])

  const { isListening, error, start, stop } = usePitchDetector({ onFrame: handleFrame })

  // Stop the microphone once the whole scale is done.
  useEffect(() => {
    if (finished && isListening) stop()
  }, [finished, isListening, stop])

  // Colour for the live glow: green when in tune, red when off or silent.
  const glowCents = liveCents == null ? SILENT_CENTS : liveCents
  const glowActive = isListening && !finished
  const sectionStyle = glowActive
    ? {
        boxShadow: `inset 0 0 140px 0 ${centsToColor(glowCents, 28)}`,
        borderColor: centsToColor(glowCents, 40),
      }
    : undefined

  const legatoCount = results.filter((r) => r.legato === true).length
  const legatoTotal = results.filter((r) => r.legato !== null).length

  return (
    <section className="song" style={sectionStyle}>
      <header className="song__topbar">
        <button type="button" className="song__back" onClick={onExit}>
          ← Roadmap
        </button>
        <span className="song__stage-num">Stage {stage.number} · Ajam / Mahur</span>
      </header>

      {/* 1. Hebrew pedagogical instruction block */}
      <div className="song__instruction" dir="rtl" lang="he">
        <span className="song__instruction-eyebrow">הוראת המורה</span>
        <p className="song__instruction-text">
          {finished ? 'כל הכבוד! השלמתם את הסולם.' : step.hebrew}
        </p>
      </div>

      {/* Timeline of the scale with a moving cursor */}
      <div className="song__timeline">
        {SCALE.map((s, i) => (
          <span
            key={s.id}
            className={`song__slot ${i < index ? 'song__slot--done' : ''} ${
              i === index ? 'song__slot--active' : ''
            }`}
          >
            {s.solfege}
          </span>
        ))}
      </div>

      {/* 2. String + finger map */}
      <div className="song__fretboard" aria-hidden="true">
        {STRINGS.map((s) => {
          const onThisString = step && step.string === s.id
          return (
            <div
              key={s.id}
              className={`song__string ${onThisString ? 'song__string--active' : ''}`}
            >
              <span className="song__string-name">
                {s.solfege} / {s.id}
              </span>
              <div className="song__slots">
                {FINGERS.map((f) => {
                  const active = onThisString && step.finger === f.id
                  return (
                    <span
                      key={f.id}
                      className={`song__finger ${active ? 'song__finger--active' : ''}`}
                      style={
                        active && liveCents != null
                          ? {
                              background: centsToColor(liveCents, 50),
                              borderColor: centsToColor(liveCents, 55),
                              color: '#07120f',
                            }
                          : undefined
                      }
                      title={f.name}
                    >
                      {f.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {!finished && (
        <>
          {/* Current target name: Solfège + English combined */}
          <div className="song__target">
            <span className="song__target-label">
              {step.solfege} / {step.english}
            </span>
            <span className="song__target-cents">
              {liveCents == null
                ? '—'
                : `${liveCents > 0 ? '+' : ''}${liveCents} cents`}
            </span>
          </div>

          {/* 3. Technique validations */}
          <div className="song__techniques">
            <div className="song__technique">
              <div className="song__technique-head">
                <span>Stability · יציבות</span>
                <span>{Math.round(stability * 100)}%</span>
              </div>
              <div className="song__meter">
                <div
                  className="song__meter-fill"
                  style={{
                    width: `${Math.round(stability * 100)}%`,
                    background: centsToColor(liveCents == null ? SILENT_CENTS : liveCents, 50),
                  }}
                />
              </div>
            </div>

            <div
              className={`song__legato ${
                index === 0
                  ? 'song__legato--na'
                  : legatoBroken
                    ? 'song__legato--broken'
                    : 'song__legato--ok'
              }`}
            >
              Legato · לגאטו:{' '}
              {index === 0 ? 'נקודת התחלה' : legatoBroken ? 'נקטע ✗' : 'רציף ✓'}
            </div>
          </div>
        </>
      )}

      {finished && (
        <div className="song__done">
          <div className="song__done-icon">♪</div>
          <h2 className="song__done-title">סיימתם את הסולם!</h2>
          <p className="song__done-text">
            Legato held on {legatoCount} of {legatoTotal} connections.
          </p>
          <div className="song__done-actions">
            <button
              type="button"
              className="song__button song__button--ghost"
              onClick={() => {
                setResults([])
                setIndex(0)
              }}
            >
              Play again
            </button>
            <button
              type="button"
              className="song__button"
              onClick={() => onComplete(stage.id)}
            >
              Back to Roadmap
            </button>
          </div>
        </div>
      )}

      {error && <p className="song__error">{error}</p>}

      {!finished && (
        <button
          type="button"
          className={`song__button song__mic ${isListening ? 'song__button--ghost' : ''}`}
          onClick={isListening ? stop : start}
        >
          {isListening ? 'Stop' : 'Enable Microphone'}
        </button>
      )}
    </section>
  )
}
