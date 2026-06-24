import { useEffect, useRef, useState } from 'react'
import AudioTestbed from './AudioTestbed.jsx'
import { createRhythmEngine } from '../audio/azerbaijaniRhythms.js'
import {
  beatSeconds,
  gradeDelta,
  gradeLabelHe,
} from '../audio/rhythmGrading.js'
import './MelodyPlayer.css'

// Each melody note only needs a brief in-tune touch before the cursor moves on,
// so the tune can flow rather than demanding a long sustain per note.
const MELODY_HOLD_MS = 500

// Practice tempos (beats per minute). One melody note = one beat.
const TEMPOS = [60, 80, 100]

/**
 * Self-paced melody practice with rhythmic grading. The player works through a
 * sequence of notes; a cursor highlights the current note and advances as soon
 * as that note is played in tune. Alongside the pitch check, a tempo guide
 * shows a scrolling beat marker and grades the TIMING of each note hit
 * (Perfect / Early / Late) against the chosen BPM — so the student practises
 * playing in time, not just in tune. An optional Azerbaijani metronome can lay
 * down the pulse.
 *
 * Props:
 *   stage      – a curriculum stage with a `melody` array.
 *   onComplete – called with the stage id when the melody is finished.
 *   onExit     – called to return to the roadmap.
 */
export default function MelodyPlayer({ stage, onComplete, onExit }) {
  const melody = stage.melody
  const [index, setIndex] = useState(0)
  const [bpm, setBpm] = useState(80)
  const [grades, setGrades] = useState([]) // one entry per passed note
  const [markerBeat, setMarkerBeat] = useState(0)
  const [metronome, setMetronome] = useState(false)
  const finished = index >= melody.length
  const currentNote = finished ? null : melody[index]

  // Rhythmic-clock bookkeeping. The clock anchors on the FIRST note hit, so the
  // student can take their time getting started; every later note is graded
  // against that anchor at the chosen tempo.
  const startRef = useRef(0)
  const rafRef = useRef(null)
  const bpmRef = useRef(80)
  const audioCtxRef = useRef(null)
  const metronomeRef = useRef(null)

  useEffect(() => {
    bpmRef.current = bpm
    if (metronomeRef.current && metronomeRef.current.isPlaying()) {
      metronomeRef.current.setBpm(bpm)
    }
  }, [bpm])

  // Keep the active note chip scrolled into view as the cursor advances.
  const stripRef = useRef(null)
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const active = strip.querySelector('.melody__note--active')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  // Drive the scrolling beat marker while practising.
  useEffect(() => {
    if (finished || startRef.current === 0) return
    const loop = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      setMarkerBeat(elapsed / beatSeconds(bpmRef.current))
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [finished, index])

  // Tear down the metronome / audio on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (metronomeRef.current) metronomeRef.current.stop()
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [])

  function handlePass() {
    const now = performance.now()
    setGrades((prev) => {
      if (index === 0 || startRef.current === 0) {
        // First note: this defines the downbeat (graded Perfect by definition).
        startRef.current = now
        return [{ grade: 'perfect', deltaMs: 0 }]
      }
      const expectedMs = index * beatSeconds(bpmRef.current) * 1000
      const actualMs = now - startRef.current
      return [...prev, gradeDelta(Math.round(actualMs - expectedMs))]
    })
    setIndex((i) => i + 1)
  }

  function resetClock() {
    startRef.current = 0
    setMarkerBeat(0)
    setGrades([])
  }

  function handleRestart() {
    resetClock()
    setIndex(0)
  }

  function ensureMetronome() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      metronomeRef.current = createRhythmEngine(audioCtxRef.current)
    }
    return metronomeRef.current
  }

  function toggleMetronome() {
    const next = !metronome
    setMetronome(next)
    const engine = ensureMetronome()
    if (next) {
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
      engine.start(bpmRef.current, 'mugham4')
    } else {
      engine.stop()
    }
  }

  // Percent position of the scrolling marker across the note strip.
  const markerPct = melody.length
    ? Math.min(100, (markerBeat / melody.length) * 100)
    : 0

  return (
    <section className="melody" dir="rtl" lang="he">
      <header className="melody__header">
        <button type="button" className="melody__back" onClick={onExit}>
          → חזרה למסלול
        </button>
        <div className="melody__heading">
          <span className="melody__stage-num">שלב {stage.number}</span>
          <h1 className="melody__title">{stage.title}</h1>
          <p className="melody__summary">{stage.summary}</p>
        </div>
      </header>

      <div className="melody__progress">
        {Math.min(index, melody.length)} / {melody.length} צלילים
      </div>

      {/* Tempo + metronome controls for rhythmic practice */}
      <div className="melody__rhythm-tools">
        <div className="melody__tempos" role="group" aria-label="קצב">
          {TEMPOS.map((t) => (
            <button
              key={t}
              type="button"
              className={`melody__tempo ${bpm === t ? 'melody__tempo--active' : ''}`}
              onClick={() => setBpm(t)}
            >
              {t} BPM
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`melody__metronome ${metronome ? 'melody__metronome--active' : ''}`}
          aria-pressed={metronome}
          onClick={toggleMetronome}
        >
          🥁 מטרונום
        </button>
      </div>

      <div className="melody__strip-wrap">
        {/* Scrolling beat marker, anchored on the first note hit. */}
        {!finished && startRef.current !== 0 && (
          <span className="melody__marker" style={{ insetInlineStart: `${markerPct}%` }} />
        )}
        <div className="melody__strip" ref={stripRef}>
          {melody.map((note, i) => {
            const done = i < index
            const active = i === index
            const grade = grades[i] ? grades[i].grade : null
            return (
              <span
                key={note.id}
                className={`melody__note ${done ? 'melody__note--done' : ''} ${
                  active ? 'melody__note--active' : ''
                } ${grade ? `melody__note--${grade}` : ''}`}
              >
                {note.short}
                {grade && (
                  <span className="melody__note-grade">{gradeLabelHe(grade)}</span>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {finished ? (
        <div className="melody__done">
          <div className="melody__done-icon">♪</div>
          <h2 className="melody__done-title">המנגינה הושלמה!</h2>
          <RhythmSummary grades={grades} />
          <div className="melody__done-actions">
            <button
              type="button"
              className="melody__button melody__button--ghost"
              onClick={handleRestart}
            >
              לנגן שוב
            </button>
            <button
              type="button"
              className="melody__button"
              onClick={() => onComplete(stage.id)}
            >
              חזרה למסלול
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="melody__cue">
            הצליל הבא: <strong>{currentNote.label}</strong>
          </p>
          <AudioTestbed
            target={currentNote}
            onPass={handlePass}
            holdMs={MELODY_HOLD_MS}
          />
        </>
      )}
    </section>
  )
}

/** A compact tally of how the timing went across the whole melody. */
function RhythmSummary({ grades }) {
  const tally = { perfect: 0, early: 0, late: 0 }
  for (const g of grades) tally[g.grade] = (tally[g.grade] || 0) + 1
  return (
    <p className="melody__done-text">
      ניגנתם את כל המנגינה בכוונון נקי. דיוק מקצבי:{' '}
      <strong className="melody__tally-perfect">{tally.perfect} מדויק</strong> ·{' '}
      <strong className="melody__tally-early">{tally.early} מוקדם</strong> ·{' '}
      <strong className="melody__tally-late">{tally.late} מאוחר</strong>
    </p>
  )
}
