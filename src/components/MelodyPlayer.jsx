import { useEffect, useRef, useState } from 'react'
import AudioTestbed from './AudioTestbed.jsx'
import './MelodyPlayer.css'

// Each melody note only needs a brief in-tune touch before the cursor moves on,
// so the tune can flow rather than demanding a long sustain per note.
const MELODY_HOLD_MS = 500

/**
 * Self-paced melody practice. The player works through a sequence of notes; a
 * cursor highlights the current note and advances as soon as that note is
 * played in tune. The stage completes once the whole melody is played.
 *
 * Props:
 *   stage      – a curriculum stage with a `melody` array.
 *   onComplete – called with the stage id when the melody is finished.
 *   onExit     – called to return to the roadmap.
 */
export default function MelodyPlayer({ stage, onComplete, onExit }) {
  const melody = stage.melody
  const [index, setIndex] = useState(0)
  const finished = index >= melody.length
  const currentNote = finished ? null : melody[index]

  // Keep the active note chip scrolled into view as the cursor advances.
  const stripRef = useRef(null)
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const active = strip.querySelector('.melody__note--active')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  function handlePass() {
    setIndex((i) => i + 1)
  }

  function handleRestart() {
    setIndex(0)
  }

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

      <div className="melody__strip" ref={stripRef}>
        {melody.map((note, i) => {
          const done = i < index
          const active = i === index
          return (
            <span
              key={note.id}
              className={`melody__note ${done ? 'melody__note--done' : ''} ${
                active ? 'melody__note--active' : ''
              }`}
            >
              {note.short}
            </span>
          )
        })}
      </div>

      {finished ? (
        <div className="melody__done">
          <div className="melody__done-icon">♪</div>
          <h2 className="melody__done-title">המנגינה הושלמה!</h2>
          <p className="melody__done-text">
            ניגנתם את כל המנגינה בכוונון נקי. כל הכבוד!
          </p>
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
