import { useEffect, useRef, useState } from 'react'
import { MAQAMS, DEFAULT_MAQAM } from '../data/maqams.js'
import './SongInstructor.css'

// Playback tempo: each scale note lasts this many seconds.
const NOTE_SECONDS = 0.9
const SYNTH_GAIN = 0.25

// The four open strings, drawn high → low, each with five finger slots.
const STRINGS = [
  { id: 'D5', solfege: 'Re' },
  { id: 'A4', solfege: 'La' },
  { id: 'D4', solfege: 'Re' },
  { id: 'A3', solfege: 'La' },
]
const FINGERS = [
  { id: 'Open', label: 'O' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: 'Pinky', label: 'ז' },
]

/**
 * Song player / instructor. Auto-plays a maqam scale and synchronises a moving
 * highlight on the fingerboard with the audio elapsed time.
 *  - Local teacher videos play their original audio (<video>).
 *  - YouTube songs (and curriculum stages) play a clean synth of the scale.
 * Transport: ⏪ / ⏯ / ⏩, where skip jumps by musical phrase.
 *
 * Props: stage?, song?, onComplete(stageId)?, onExit().
 */
export default function SongInstructor({ stage, song, onComplete, onExit }) {
  const maqamId = (song && song.maqam) || DEFAULT_MAQAM
  const maqam = MAQAMS[maqamId] || MAQAMS[DEFAULT_MAQAM]
  const notes = maqam.notes
  const total = notes.length * NOTE_SECONDS
  const isLocalVideo = Boolean(song && song.isLocal)
  const isYouTube = Boolean(song && !song.isLocal)

  const headerLabel = song ? song.title : `Stage ${stage.number} · ${maqam.nameHe}`
  const backLabel = song ? '← ספרייה' : '← Roadmap'

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [videoError, setVideoError] = useState(false)

  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const startWallRef = useRef(0) // performance.now() when synth playback (re)started
  const seekRef = useRef(0) // elapsed-seconds offset (synth)
  const lastTriggeredRef = useRef(-1)
  const videoRef = useRef(null)

  const step = notes[currentIndex]

  // Tear down audio + animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [])

  function ensureCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
    }
    return audioCtxRef.current
  }

  // A short, clean digital synth tone with a quick attack/decay envelope.
  function playTone(frequency) {
    const ctx = ensureCtx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(SYNTH_GAIN, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + NOTE_SECONDS * 0.95)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + NOTE_SECONDS)
  }

  function stopLoop() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function frame() {
    const elapsed =
      isLocalVideo && videoRef.current
        ? videoRef.current.currentTime
        : seekRef.current + (performance.now() - startWallRef.current) / 1000

    if (elapsed >= total) {
      finishPlayback()
      return
    }

    const idx = Math.min(Math.floor(elapsed / NOTE_SECONDS), notes.length - 1)
    if (idx !== lastTriggeredRef.current) {
      lastTriggeredRef.current = idx
      setCurrentIndex(idx)
      if (!isLocalVideo) playTone(notes[idx].frequency)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  async function play() {
    if (seekRef.current >= total) {
      seekRef.current = 0
      setCurrentIndex(0)
    }
    lastTriggeredRef.current = -1

    if (isLocalVideo) {
      const video = videoRef.current
      if (video) {
        try {
          await video.play()
        } catch {
          setVideoError(true)
        }
      }
    } else {
      const ctx = ensureCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      startWallRef.current = performance.now()
    }

    setIsPlaying(true)
    stopLoop()
    rafRef.current = requestAnimationFrame(frame)
  }

  function pause() {
    stopLoop()
    if (isLocalVideo && videoRef.current) {
      videoRef.current.pause()
    } else {
      seekRef.current += (performance.now() - startWallRef.current) / 1000
    }
    setIsPlaying(false)
  }

  function finishPlayback() {
    stopLoop()
    if (isLocalVideo && videoRef.current) videoRef.current.pause()
    seekRef.current = total
    setIsPlaying(false)
    setCurrentIndex(notes.length - 1)
  }

  function togglePlay() {
    if (isPlaying) pause()
    else play()
  }

  function seekToIndex(idx) {
    const clamped = Math.max(0, Math.min(idx, notes.length - 1))
    const time = clamped * NOTE_SECONDS
    seekRef.current = time
    lastTriggeredRef.current = -1
    setCurrentIndex(clamped)
    if (isLocalVideo && videoRef.current) videoRef.current.currentTime = time
    if (isPlaying) startWallRef.current = performance.now()
  }

  // Skip by musical phrase (tetrachord), not single notes.
  function skipNext() {
    const next = maqam.phraseStarts.find((p) => p > currentIndex)
    seekToIndex(next ?? notes.length - 1)
  }

  function skipPrev() {
    const reversed = [...maqam.phraseStarts].reverse()
    const currentPhrase = reversed.find((p) => p <= currentIndex) ?? 0
    if (currentIndex > currentPhrase) {
      seekToIndex(currentPhrase)
    } else {
      const prev = reversed.find((p) => p < currentPhrase)
      seekToIndex(prev ?? 0)
    }
  }

  const progress = ((currentIndex + 1) / notes.length) * 100

  return (
    <section className="song">
      <header className="song__topbar">
        <button type="button" className="song__back" onClick={onExit}>
          {backLabel}
        </button>
        <span className="song__stage-num" dir={song ? 'rtl' : undefined}>
          {headerLabel}
        </span>
      </header>

      {/* Media: local video, or a synth indicator (YouTube thumbnail / stage) */}
      <div className="song__media">
        {isLocalVideo ? (
          videoError ? (
            <div className="song__media-fallback" dir="rtl" lang="he">
              וידאו מקומי לא נמצא — חברו את קובץ הווידאו
            </div>
          ) : (
            <video
              ref={videoRef}
              className="song__video"
              src={`/videos/${song.file}`}
              playsInline
              onEnded={finishPlayback}
              onError={() => setVideoError(true)}
            />
          )
        ) : (
          <div className="song__synth">
            {isYouTube && (
              <img
                className="song__synth-thumb"
                src={`https://img.youtube.com/vi/${song.youtubeId}/mqdefault.jpg`}
                alt=""
                aria-hidden="true"
              />
            )}
            <span className="song__synth-badge" dir="rtl" lang="he">
              ♪ מנוגן בסינתיסייזר · {maqam.nameHe}
            </span>
          </div>
        )}
      </div>

      {/* Hebrew Solfège instruction */}
      <div className="song__instruction" dir="rtl" lang="he">
        <span className="song__instruction-eyebrow">נגנו יחד</span>
        <p className="song__instruction-text">{step.solfegeHe}</p>
      </div>

      {/* Scale timeline with the moving cursor */}
      <div className="song__timeline" dir="rtl">
        {notes.map((n, i) => (
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

      {/* String + finger map, synced to the elapsed time */}
      <div className="song__fretboard" aria-hidden="true">
        {STRINGS.map((s) => {
          const onThisString = step.string === s.id
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

      {/* Progress + transport controls */}
      <div className="song__progressbar">
        <div className="song__progressbar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="song__transport">
        <button
          type="button"
          className="song__ctrl"
          onClick={skipPrev}
          aria-label="Previous phrase"
        >
          ⏪
        </button>
        <button
          type="button"
          className="song__ctrl song__ctrl--play"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="song__ctrl"
          onClick={skipNext}
          aria-label="Next phrase"
        >
          ⏩
        </button>
      </div>

      {onComplete && (
        <button
          type="button"
          className="song__button song__button--ghost"
          onClick={() => onComplete(stage.id)}
        >
          סמן שלב כהושלם
        </button>
      )}
    </section>
  )
}
