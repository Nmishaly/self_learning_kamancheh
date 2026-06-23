import { useEffect, useState } from 'react'
import { STAGES } from '../data/curriculum.js'
import StagePractice from './StagePractice.jsx'
import './CurriculumRoadmap.css'

const STORAGE_KEY = 'kamancheh-progress'

// Small inline icons keep the dependency-free, minimalist look.
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm3 8H9V7a3 3 0 0 1 6 0v3Z"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

/** Load completed stage ids from localStorage (ignoring any bad data). */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function CurriculumRoadmap() {
  const [completedIds, setCompletedIds] = useState(loadProgress)
  const [activeStageId, setActiveStageId] = useState(null)

  // Persist progress so the student keeps their place between visits.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIds))
    } catch {
      // Storage may be unavailable (private mode); progress just won't persist.
    }
  }, [completedIds])

  // A stage is unlocked if it's the first one or its predecessor is complete.
  function isUnlocked(index) {
    if (index === 0) return true
    return completedIds.includes(STAGES[index - 1].id)
  }

  function handleComplete(stageId) {
    setCompletedIds((prev) =>
      prev.includes(stageId) ? prev : [...prev, stageId],
    )
    setActiveStageId(null)
  }

  const activeStage = STAGES.find((s) => s.id === activeStageId)
  if (activeStage) {
    return (
      <StagePractice
        stage={activeStage}
        onComplete={handleComplete}
        onExit={() => setActiveStageId(null)}
      />
    )
  }

  const completedCount = completedIds.length

  return (
    <section className="roadmap">
      <header className="roadmap__header">
        <h1 className="roadmap__title">Kamancheh Path</h1>
        <p className="roadmap__subtitle">
          {completedCount} of {STAGES.length} stages complete
        </p>
      </header>

      <ol className="roadmap__list">
        {STAGES.map((stage, index) => {
          const completed = completedIds.includes(stage.id)
          const unlocked = isUnlocked(index)
          const locked = !unlocked && !completed
          const status = completed
            ? 'completed'
            : unlocked
              ? 'unlocked'
              : 'locked'

          return (
            <li key={stage.id} className="roadmap__item">
              <span className={`roadmap__connector roadmap__connector--${status}`} />
              <button
                type="button"
                className={`roadmap__node roadmap__node--${status}`}
                onClick={() => unlocked && setActiveStageId(stage.id)}
                disabled={locked}
                aria-label={`Stage ${stage.number}: ${stage.title}${
                  locked ? ' (locked)' : ''
                }`}
              >
                <span className="roadmap__badge">
                  {completed ? (
                    <CheckIcon />
                  ) : locked ? (
                    <LockIcon />
                  ) : (
                    stage.number
                  )}
                </span>
                <span className="roadmap__node-body">
                  <span className="roadmap__node-title">{stage.title}</span>
                  <span className="roadmap__node-summary">{stage.summary}</span>
                  <span className="roadmap__node-status">
                    {completed
                      ? 'Completed · tap to revisit'
                      : unlocked
                        ? 'Tap to practice'
                        : 'Locked'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
