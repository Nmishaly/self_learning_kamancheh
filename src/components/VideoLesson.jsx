import { useEffect, useRef, useState } from 'react'
import './SongInstructor.css'

// Practice speeds (no pitch change — the browser preserves pitch).
const SPEEDS = [0.5, 0.75, 1]

/**
 * Honest player for a LOCAL teacher recording. We have not transcribed these
 * videos, so we deliberately do NOT draw a fabricated fingering overlay (which
 * would mislead the student). Instead we give the genuinely useful practice
 * tools around a real teacher demo: slow-down (pitch-preserving), whole-clip
 * loop, and play/pause.
 *
 * Props: song (with `file`, `title`), onExit().
 */
export default function VideoLesson({ song, onExit }) {
  const videoRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // Keep the <video> element's properties in sync with the controls.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = speed
    v.preservesPitch = true
  }, [speed])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.loop = loop
  }, [loop])

  async function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (isPlaying) {
      v.pause()
    } else {
      try {
        v.playbackRate = speed
        v.preservesPitch = true
        await v.play()
      } catch {
        setVideoError(true)
      }
    }
  }

  return (
    <section className="song">
      <header className="song__topbar">
        <button type="button" className="song__back" onClick={onExit}>
          → ספרייה
        </button>
        <span className="song__stage-num" dir="rtl">
          {song.title}
        </span>
      </header>

      <div className="song__media">
        {videoError ? (
          <div className="song__media-fallback" dir="rtl" lang="he">
            וידאו לא נמצא — חברו את קובץ הווידאו של השיעור
          </div>
        ) : (
          <video
            ref={videoRef}
            className="song__video"
            src={`/videos/${song.file}`}
            playsInline
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setVideoError(true)}
          />
        )}
      </div>

      <p className="song__hint" dir="rtl" lang="he">
        צפו במורה, האטו את הקצב לפי הצורך, וחזרו על הקטע עד שמרגישים בנוח.
      </p>

      {/* Practice tools: slow down (no pitch change) + loop the whole clip */}
      <div className="song__practice" dir="rtl" lang="he">
        <div className="song__speeds" role="group" aria-label="מהירות נגינה">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`song__speed ${speed === s ? 'song__speed--active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {Math.round(s * 100)}%
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`song__loop ${loop ? 'song__loop--active' : ''}`}
          aria-pressed={loop}
          onClick={() => setLoop((v) => !v)}
        >
          🔁 חזרה אינסופית
        </button>
      </div>

      <div className="song__transport">
        <button
          type="button"
          className="song__ctrl song__ctrl--play"
          onClick={togglePlay}
          aria-label={isPlaying ? 'השהיה' : 'נגינה'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>
    </section>
  )
}
