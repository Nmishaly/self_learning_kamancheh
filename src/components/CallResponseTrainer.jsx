import { useCallback, useEffect, useRef, useState } from 'react'
import { createKamanchehSampler } from '../audio/kamanchehSampler.js'
import { usePitchDetector } from '../audio/usePitchDetector.js'
import {
  PHRASES,
  DEFAULT_PHRASE,
  phraseToTimedNotes,
  phraseDuration,
} from '../data/phrases.js'
import {
  detectOnsets,
  gradePerformance,
  summarizeGrades,
  gradeLabelHe,
} from '../audio/rhythmGrading.js'
import { showToast } from '../ui/toast.js'
import './CallResponseTrainer.css'

// Extra listening time after the phrase length, so the student can finish the
// final (held) note before the microphone stops.
const RESPONSE_TAIL_SECONDS = 1.6

const PHASE_LABEL = {
  idle: 'מוכנים?',
  call: '🎧 האזינו',
  response: '🎻 נגנו עכשיו!',
  feedback: 'משוב',
}

/**
 * Call-and-response ear-training mode (Azerbaijani Mugham phrases):
 *   1. CALL     — the app plays a short phrase on the Kamancheh sampler.
 *   2. RESPONSE — playback stops, the mic opens, the student mimics by ear.
 *   3. FEEDBACK — a graph compares the target vs the student's pitch + rhythm,
 *                 grading each note Perfect / Early / Late.
 *
 * Props: onExit().
 */
export default function CallResponseTrainer({ onExit }) {
  const [phraseId, setPhraseId] = useState(DEFAULT_PHRASE)
  const [phase, setPhase] = useState('idle')
  const [results, setResults] = useState(null) // graded performance | null
  const [score, setScore] = useState(null)

  const phrase = PHRASES.find((p) => p.id === phraseId) || PHRASES[0]
  const timed = phraseToTimedNotes(phrase)
  const duration = phraseDuration(phrase)

  const audioCtxRef = useRef(null)
  const samplerRef = useRef(null)
  const timersRef = useRef([])
  const framesRef = useRef([]) // { t, frequency } captured during RESPONSE
  const responseStartRef = useRef(0)
  const canvasRef = useRef(null)

  // Keep the latest target available to the (stable) frame callback.
  const phraseRef = useRef(phrase)
  useEffect(() => {
    phraseRef.current = phrase
  }, [phrase])

  function ensureCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      samplerRef.current = createKamanchehSampler(audioCtxRef.current)
      samplerRef.current.load().catch(() => {})
    }
    return audioCtxRef.current
  }

  function clearTimers() {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
  }

  // Collect voiced pitch frames during the response window (times relative to
  // the moment the mic opened).
  const onFrame = useCallback(({ frequency, timestamp }) => {
    const t = (timestamp - responseStartRef.current) / 1000
    framesRef.current.push({ t, frequency: frequency > 0 ? frequency : -1 })
  }, [])

  const detector = usePitchDetector({ onFrame })

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      clearTimers()
      detector.stop()
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function playCall() {
    const ctx = ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    if (samplerRef.current) {
      try {
        await samplerRef.current.load()
      } catch {
        // Samples unavailable — the sampler will simply no-op; the visual
        // timeline still teaches the phrase.
      }
    }
    const now = ctx.currentTime
    const notes = phraseToTimedNotes(phraseRef.current)
    for (const note of notes) {
      if (samplerRef.current) {
        samplerRef.current.play(note.frequency, now + note.time + 0.05, note.duration)
      }
    }
  }

  async function startResponse() {
    setPhase('response')
    showToast(PHASE_LABEL.response, 'success')
    framesRef.current = []
    responseStartRef.current = performance.now()
    await detector.start()

    const total = phraseDuration(phraseRef.current) + RESPONSE_TAIL_SECONDS
    const stopTimer = setTimeout(() => finishResponse(), total * 1000)
    timersRef.current.push(stopTimer)
  }

  function finishResponse() {
    clearTimers()
    detector.stop()

    const target = phraseToTimedNotes(phraseRef.current)
    const expectedTimes = target.map((nt) => nt.time)
    const onsets = detectOnsets(framesRef.current)
    const graded = gradePerformance(expectedTimes, onsets)
    const summary = summarizeGrades(graded)

    setResults(graded)
    setScore(summary)
    setPhase('feedback')
    showToast(`ניקוד מקצב: ${summary.score} מתוך 100`, 'info')
  }

  async function startExercise() {
    clearTimers()
    setResults(null)
    setScore(null)
    setPhase('call')
    showToast(PHASE_LABEL.call, 'info')

    await playCall()

    // After the phrase finishes playing, hand over to the student.
    const callTimer = setTimeout(
      () => startResponse(),
      (phraseDuration(phraseRef.current) + 0.4) * 1000,
    )
    timersRef.current.push(callTimer)
  }

  function cancel() {
    clearTimers()
    detector.stop()
    setPhase('idle')
    setResults(null)
    setScore(null)
  }

  function changePhrase(id) {
    cancel()
    setPhraseId(id)
  }

  // Draw the comparison graph once feedback is ready (and on resize).
  useEffect(() => {
    if (phase !== 'feedback') return
    drawComparison(canvasRef.current, phraseRef.current, framesRef.current, results)
  }, [phase, results])

  const busy = phase === 'call' || phase === 'response'

  return (
    <section className="cr" dir="rtl" lang="he">
      <header className="cr__topbar">
        <button type="button" className="cr__back" onClick={onExit}>
          → חזרה
        </button>
        <h1 className="cr__title">הקשבה ותגובה</h1>
      </header>

      <p className="cr__intro">
        האפליקציה תנגן משפט קצר ממוגאם אזרי. הקשיבו, ואז נסו לחזור עליו באוזן —
        בלי תווים. בסוף תקבלו השוואה של הגובה והמקצב.
      </p>

      <label className="cr__select-row">
        <span className="cr__select-label">משפט לתרגול</span>
        <select
          className="cr__select"
          value={phraseId}
          onChange={(e) => changePhrase(e.target.value)}
          disabled={busy}
        >
          {PHRASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nameHe}
            </option>
          ))}
        </select>
      </label>
      <p className="cr__phrase-desc">{phrase.description}</p>

      {/* Phrase preview: the notes the student must reproduce. */}
      <div className="cr__phrase-strip">
        {timed.map((note, i) => (
          <span key={`${note.solfegeHe}-${i}`} className="cr__phrase-note">
            {note.solfegeHe}
          </span>
        ))}
      </div>

      <div className={`cr__phase cr__phase--${phase}`}>
        <span className="cr__phase-badge">{PHASE_LABEL[phase]}</span>
        {detector.error && <span className="cr__error">{detector.error}</span>}
      </div>

      {phase === 'feedback' && score && (
        <>
          <div className="cr__score">
            <span className="cr__score-num">{score.score}</span>
            <span className="cr__score-max">/ 100 מקצב</span>
          </div>

          <canvas ref={canvasRef} className="cr__graph" />

          <div className="cr__grades">
            {results.map((r, i) => (
              <span
                key={i}
                className={`cr__grade cr__grade--${r.grade}`}
                title={r.deltaMs != null ? `${r.deltaMs > 0 ? '+' : ''}${r.deltaMs}ms` : 'הוחמץ'}
              >
                {timed[i] ? timed[i].solfegeHe : ''} ·{' '}
                {r.grade === 'miss' ? 'הוחמץ' : gradeLabelHe(r.grade)}
              </span>
            ))}
          </div>
          <p className="cr__legend">
            <span className="cr__legend-item cr__legend-target">— יעד</span>
            <span className="cr__legend-item cr__legend-you">● הנגינה שלכם</span>
          </p>
        </>
      )}

      <div className="cr__controls">
        {phase === 'idle' || phase === 'feedback' ? (
          <button type="button" className="cr__btn cr__btn--primary" onClick={startExercise}>
            {phase === 'feedback' ? '🔁 שוב' : '▶ התחילו'}
          </button>
        ) : (
          <button type="button" className="cr__btn" onClick={cancel}>
            עצירה
          </button>
        )}
      </div>
    </section>
  )
}

// ── Feedback rendering ──────────────────────────────────────────────────────

const GRADE_COLOR = {
  perfect: '#34d399',
  early: '#fbbf24',
  late: '#fb923c',
  miss: '#f87171',
}

/**
 * Draw the target phrase (stepped line) against the student's recorded pitch
 * (dots), on a shared time × log-pitch grid, with onset markers coloured by
 * their Perfect/Early/Late grade.
 */
function drawComparison(canvas, phrase, frames, results) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 320
  const height = canvas.clientHeight || 180
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const target = phraseToTimedNotes(phrase)
  const totalT = phraseDuration(phrase) + RESPONSE_TAIL_SECONDS

  // Shared pitch range (in cents from a reference) across target + performance.
  const ref = 261.63 // C4, an arbitrary stable anchor
  const toCents = (f) => 1200 * Math.log2(f / ref)
  let minC = Infinity
  let maxC = -Infinity
  for (const n of target) {
    minC = Math.min(minC, toCents(n.frequency))
    maxC = Math.max(maxC, toCents(n.frequency))
  }
  for (const f of frames) {
    if (f.frequency > 0) {
      minC = Math.min(minC, toCents(f.frequency))
      maxC = Math.max(maxC, toCents(f.frequency))
    }
  }
  if (!isFinite(minC) || !isFinite(maxC)) {
    minC = 0
    maxC = 1200
  }
  const pad = 80
  minC -= pad
  maxC += pad

  const padL = 8
  const padR = 8
  const padT = 12
  const padB = 12
  const x = (t) => padL + (t / totalT) * (width - padL - padR)
  const y = (cents) =>
    height - padB - ((cents - minC) / (maxC - minC || 1)) * (height - padT - padB)

  // Background grid.
  ctx.strokeStyle = '#23232a'
  ctx.lineWidth = 1
  for (const n of target) {
    ctx.beginPath()
    ctx.moveTo(x(n.time), padT)
    ctx.lineTo(x(n.time), height - padB)
    ctx.stroke()
  }

  // Target: a stepped line, one flat segment per note.
  ctx.strokeStyle = '#5eead4'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  target.forEach((n) => {
    const yy = y(toCents(n.frequency))
    ctx.moveTo(x(n.time), yy)
    ctx.lineTo(x(n.time + n.duration), yy)
  })
  ctx.stroke()

  // Student performance: voiced pitch as a dotted trail.
  ctx.fillStyle = 'rgba(167, 139, 250, 0.9)'
  for (const f of frames) {
    if (f.frequency > 0) {
      ctx.beginPath()
      ctx.arc(x(f.t), y(toCents(f.frequency)), 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Onset markers coloured by grade, on each target note's line.
  if (Array.isArray(results)) {
    results.forEach((r) => {
      const n = target[r.index]
      if (!n) return
      const color = GRADE_COLOR[r.grade] || '#888'
      const yy = y(toCents(n.frequency))
      if (r.actual != null) {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x(r.actual), yy - 9)
        ctx.lineTo(x(r.actual), yy + 9)
        ctx.stroke()
      }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x(n.time), yy, 4, 0, Math.PI * 2)
      ctx.fill()
    })
  }
}
