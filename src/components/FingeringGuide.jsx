import { useEffect, useRef } from 'react'

// The four open strings of the classical Azerbaijani tuning (Re–Sol–Re–Sol),
// drawn high → low, each with five finger slots.
export const STRINGS = [
  { id: 'G4', solfege: 'Sol' },
  { id: 'D4', solfege: 'Re' },
  { id: 'G3', solfege: 'Sol' },
  { id: 'D3', solfege: 'Re' },
]
export const FINGERS = [
  { id: 'Open', label: 'O' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: 'Pinky', label: 'ז' },
]

// Hebrew labels for the on-screen "where to play" guidance. The ׳ (geresh)
// marks the higher octave of each repeated Re / Sol string.
export const STRING_HE = { G4: 'מיתר סול׳', D4: 'מיתר רה׳', G3: 'מיתר סול', D3: 'מיתר רה' }
export const FINGER_HE = { Open: 'פתוח', 1: 'אצבע 1', 2: 'אצבע 2', 3: 'אצבע 3', Pinky: 'זרת' }

const placement = (s) =>
  `${STRING_HE[s.string] || s.string} · ${FINGER_HE[s.finger] || ''}`

/**
 * Presentational fingering overlay shared by the synth/upload player
 * (SongInstructor) and the teacher-video player (VideoLesson): the "what to
 * play / where" guide, the scrolling note timeline, and the string + finger
 * map. It is driven entirely by `steps` and the active `currentIndex`.
 */
export default function FingeringGuide({ steps, currentIndex }) {
  const timelineRef = useRef(null)
  const step = steps[currentIndex] || steps[0]
  const nextStep = steps[currentIndex + 1]

  // Keep the active note centred in the horizontally-scrolling timeline.
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const active = el.querySelector('.song__slot--active')
    if (active)
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentIndex])

  if (!step) return null

  return (
    <>
      {/* Pedagogical guide: what to play, where, and what's next */}
      <div className="song__guide" dir="rtl" lang="he">
        <div className="song__guide-main">
          <span className="song__guide-note">{step.solfegeHe}</span>
          <span className="song__guide-where">{placement(step)}</span>
          {step.finger === 'Open' && (
            <span className="song__guide-open" title="מיתר פתוח">
              ○ מיתר פתוח
            </span>
          )}
        </div>
        <div className="song__guide-meta">
          {step.instruction && (
            <span className="song__guide-technique">{step.instruction}</span>
          )}
          <span className="song__guide-next">
            הבא: {nextStep ? nextStep.solfegeHe : '—'}
          </span>
        </div>
      </div>

      {/* Timeline with the moving, auto-centred cursor */}
      <div className="song__timeline" dir="rtl" ref={timelineRef}>
        {steps.map((n, i) => (
          <span
            key={`${n.english}-${i}`}
            className={`song__slot ${i < currentIndex ? 'song__slot--done' : ''} ${
              i === currentIndex ? 'song__slot--active' : ''
            }`}
          >
            {n.solfegeHe}
          </span>
        ))}
      </div>

      {/* String + finger map, synced to the elapsed time. */}
      <div className="song__fretboard">
        {STRINGS.map((s) => {
          const onThisString = step.string === s.id
          return (
            <div
              key={s.id}
              className={`song__string ${onThisString ? 'song__string--active' : ''}`}
            >
              <span className="song__string-name">{STRING_HE[s.id] || s.id}</span>
              <div className="song__slots">
                {FINGERS.map((f) => {
                  const active = onThisString && step.finger === f.id
                  const openActive = active && f.id === 'Open'
                  return (
                    <span
                      key={f.id}
                      className={`song__finger ${active ? 'song__finger--active' : ''} ${
                        openActive ? 'song__finger--open' : ''
                      }`}
                    >
                      {active ? step.solfegeHe : f.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
