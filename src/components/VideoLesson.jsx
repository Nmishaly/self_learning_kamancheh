import { useEffect, useRef, useState } from 'react'
import { decodeAndAnalyze } from '../audio/analyzeAudio.js'
import { stepsFromTranscript, indexAtTime } from '../audio/steps.js'
import { loadTranscript, saveTranscript } from '../audio/transcriptCache.js'
import FingeringGuide from './FingeringGuide.jsx'
import './SongInstructor.css'

// Practice speeds (no pitch change — the browser preserves pitch).
const SPEEDS = [0.5, 0.75, 1]

// Skip very large clips: decoding their full audio in-browser isn't worth it.
const MAX_TRANSCRIBE_BYTES = 60 * 1024 * 1024

/**
 * Player for a LOCAL teacher recording. The student watches the real demo with
 * pitch-preserving slow-down and looping. In the background we also transcribe
 * the clip's audio ON-DEVICE (once, then cached) to draw a fingering guide that
 * follows along — so the student can see which string and finger to use. If the
 * file is missing or can't be analysed, it gracefully stays a plain video.
 *
 * Props: song (with `file`, `title`), onExit().
 */
export default function VideoLesson({ song, onExit }) {
  const videoRef = useRef(null)
  const rafRef = useRef(null)
  const stepsRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [videoError, setVideoError] = useState(false)

  const [steps, setSteps] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  // 'analyzing' | 'ready' | 'unavailable'
  const [guideStatus, setGuideStatus] = useState('analyzing')
  const [progress, setProgress] = useState(0)

  // Keep the controls in sync with the <video> element.
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

  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

  // Transcribe the clip's audio once (cached by filename), in the background.
  useEffect(() => {
    let cancelled = false

    function apply(result) {
      if (cancelled) return
      setSteps(stepsFromTranscript(result.notes))
      setCurrentIndex(0)
      setGuideStatus('ready')
    }

    async function run() {
      const cached = loadTranscript(song.file)
      if (cached) {
        apply(cached)
        return
      }
      setGuideStatus('analyzing')
      try {
        const res = await fetch(`/videos/${song.file}`)
        const type = res.headers.get('content-type') || ''
        const len = Number(res.headers.get('content-length') || 0)
        // A missing file is rewritten to the SPA's index.html (text/html).
        if (!res.ok || type.includes('text/html') || len > MAX_TRANSCRIBE_BYTES) {
          if (!cancelled) setGuideStatus('unavailable')
          return
        }
        const arrayBuffer = await res.arrayBuffer()
        if (cancelled) return
        const result = await decodeAndAnalyze(arrayBuffer, (f) => {
          if (!cancelled) setProgress(Math.round(f * 100))
        })
        if (cancelled) return
        if (!result.notes || result.notes.length === 0) {
          setGuideStatus('unavailable')
          return
        }
        saveTranscript(song.file, result)
        apply(result)
      } catch {
        if (!cancelled) setGuideStatus('unavailable')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [song.file])

  // Drive the fingering cursor off the video's own clock while it plays.
  function startSync() {
    stopSync()
    const tick = () => {
      const v = videoRef.current
      if (v && stepsRef.current) {
        setCurrentIndex(indexAtTime(stepsRef.current, v.currentTime))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }
  function stopSync() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }
  useEffect(() => stopSync, [])

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

  function handlePlay() {
    setIsPlaying(true)
    startSync()
  }
  function handlePause() {
    setIsPlaying(false)
    stopSync()
  }

  const hasGuide = guideStatus === 'ready' && steps && steps.length > 0

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
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handlePause}
            onError={() => setVideoError(true)}
          />
        )}
      </div>

      {/* Background-transcription status (only while it's working). */}
      {guideStatus === 'analyzing' && (
        <p className="song__hint" dir="rtl" lang="he">
          מכין מדריך אצבעות… {progress}%
        </p>
      )}

      {hasGuide ? (
        <FingeringGuide steps={steps} currentIndex={currentIndex} />
      ) : (
        <p className="song__hint" dir="rtl" lang="he">
          צפו במורה, האטו את הקצב לפי הצורך, וחזרו על הקטע עד שמרגישים בנוח.
        </p>
      )}

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
