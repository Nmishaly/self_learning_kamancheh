import { useEffect, useState } from 'react'
import AudioTestbed from './AudioTestbed.jsx'
import './StagePractice.css'

/**
 * Practice view for a single curriculum stage. It walks the player through the
 * stage's target notes one at a time, calibrating the tuner to each target,
 * and marks the stage complete once every target has been held in tune.
 *
 * Props:
 *   stage      – a stage object from the curriculum (with `targets`).
 *   onComplete – called with the stage id when all targets are passed.
 *   onExit     – called to return to the roadmap.
 */
export default function StagePractice({ stage, onComplete, onExit }) {
  const [passedIds, setPassedIds] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)

  const allPassed = passedIds.length === stage.targets.length
  const activeTarget = allPassed ? null : stage.targets[activeIndex]

  // After a target is passed, jump to the next one still needing work.
  useEffect(() => {
    if (allPassed) return
    const nextUnpassed = stage.targets.findIndex((t) => !passedIds.includes(t.id))
    if (nextUnpassed !== -1) setActiveIndex(nextUnpassed)
  }, [passedIds, stage, allPassed])

  function handlePass() {
    const current = stage.targets[activeIndex]
    setPassedIds((prev) =>
      prev.includes(current.id) ? prev : [...prev, current.id],
    )
  }

  return (
    <section className="practice">
      <header className="practice__header">
        <button type="button" className="practice__back" onClick={onExit}>
          ← Roadmap
        </button>
        <div className="practice__heading">
          <span className="practice__stage-num">Stage {stage.number}</span>
          <h1 className="practice__title">{stage.title}</h1>
          <p className="practice__summary">{stage.summary}</p>
        </div>
      </header>

      <div className="practice__progress">
        {passedIds.length} / {stage.targets.length} notes in tune
      </div>

      <div className="practice__targets">
        {stage.targets.map((t, i) => {
          const passed = passedIds.includes(t.id)
          const active = !allPassed && i === activeIndex
          return (
            <button
              key={t.id}
              type="button"
              className={`practice__chip ${passed ? 'practice__chip--passed' : ''} ${
                active ? 'practice__chip--active' : ''
              }`}
              onClick={() => !allPassed && setActiveIndex(i)}
              disabled={allPassed}
            >
              <span className="practice__chip-short">{t.short}</span>
              {passed && <span className="practice__chip-check">✓</span>}
            </button>
          )
        })}
      </div>

      {allPassed ? (
        <div className="practice__done">
          <div className="practice__done-icon">✓</div>
          <h2 className="practice__done-title">Stage complete!</h2>
          <p className="practice__done-text">
            You held every note in tune. The next stage is now unlocked.
          </p>
          <button
            type="button"
            className="practice__done-button"
            onClick={() => onComplete(stage.id)}
          >
            Back to Roadmap
          </button>
        </div>
      ) : (
        <AudioTestbed target={activeTarget} onPass={handlePass} />
      )}
    </section>
  )
}
