import { useEffect, useRef, useState } from 'react'
import { MAQAMS, DEFAULT_MAQAM, resolveHebrewNote } from '../data/maqams.js'
import './SongInstructor.css'

// Playback tempo: each scale note lasts this many seconds.
const NOTE_SECONDS = 0.9
const SYNTH_GAIN = 0.22

// A short white-noise buffer (cached on the AudioContext) used for the bow
// "scratch" transient at the start of each note.
function getNoiseBuffer(ctx) {
  if (!ctx._kamNoise) {
    const length = Math.floor(ctx.sampleRate * 0.3)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    ctx._kamNoise = buffer
  }
  return ctx._kamNoise
}

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

  // Prefer AI-translated phrases (with real timestamps) when the song has them;
  // otherwise fall back to the maqam's evenly-spaced scale.
  const aiNotes =
    song && Array.isArray(song.notes) && song.notes.length > 0 ? song.notes : null

  const baseSteps = aiNotes
    ? aiNotes
        .map((n, i) => ({
          solfegeHe: n.note,
          instruction: n.instruction,
          start: typeof n.time === 'number' ? n.time : i * NOTE_SECONDS,
          ...resolveHebrewNote(n.note),
        }))
        .sort((a, b) => a.start - b.start)
    : maqam.notes.map((n, i) => ({ ...n, start: i * NOTE_SECONDS }))

  // Each note sustains until the next note's timestamp, so synth playback is
  // continuous and matches the AI-generated rhythm (last note gets a tail).
  const steps = baseSteps.map((s, i) => {
    const next = baseSteps[i + 1]
    const duration = next ? Math.max(0.12, next.start - s.start) : NOTE_SECONDS
    return { ...s, duration }
  })

  const total = steps.length
    ? steps[steps.length - 1].start + steps[steps.length - 1].duration
    : 0

  // Skip points: the maqam's tetrachords, or every four notes for an AI melody.
  const phraseStarts = aiNotes
    ? steps.map((_, i) => i).filter((i) => i % 4 === 0)
    : maqam.phraseStarts

  const isLocalVideo = Boolean(song && song.isLocal)
  const isYouTube = Boolean(song && !song.isLocal)

  const headerLabel = song ? song.title : `Stage ${stage.number} · ${maqam.nameHe}`
  const backLabel = song ? '← ספרייה' : '← Roadmap'

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [videoError, setVideoError] = useState(false)

  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const startWallRef = useRef(0) // audio-clock anchor: ctx.currentTime at elapsed 0
  const seekRef = useRef(0) // elapsed-seconds offset (synth)
  const lastTriggeredRef = useRef(-1)
  const videoRef = useRef(null)

  const step = steps[currentIndex] || steps[0]

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

  // A bowed-string (Kamancheh) voice built from: two slightly-detuned sawtooth
  // oscillators (the bowed string's rich, edgy core) + a triangle (warm body),
  // an eased-in vibrato LFO on pitch, a bow-bite low-pass filter envelope, a
  // parallel band-pass "body resonance", a brief filtered-noise bow scratch at
  // the onset, and an attack/decay/sustain/release amplitude envelope.
  function playTone(frequency, duration = NOTE_SECONDS) {
    const ctx = ensureCtx()
    const now = ctx.currentTime
    const dur = Math.min(Math.max(duration, 0.12), 3.0)
    const peak = SYNTH_GAIN
    const sustain = SYNTH_GAIN * 0.75
    const attack = Math.min(0.08, dur * 0.3) // slow bow onset (not a pluck)
    const decay = Math.min(0.12, dur * 0.3)
    const release = Math.min(0.12, dur * 0.3)

    // Oscillators.
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = frequency
    osc1.detune.value = -6
    const osc2 = ctx.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.value = frequency
    osc2.detune.value = 6
    const osc3 = ctx.createOscillator()
    osc3.type = 'triangle'
    osc3.frequency.value = frequency

    const oscMix = ctx.createGain()
    const g1 = ctx.createGain()
    g1.gain.value = 0.32
    const g2 = ctx.createGain()
    g2.gain.value = 0.32
    const g3 = ctx.createGain()
    g3.gain.value = 0.36
    osc1.connect(g1).connect(oscMix)
    osc2.connect(g2).connect(oscMix)
    osc3.connect(g3).connect(oscMix)

    // Vibrato (eased in after the attack, like a player settling the bow).
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.5
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.setValueAtTime(0, now)
    lfoDepth.gain.linearRampToValueAtTime(13, now + Math.min(0.25, dur * 0.5)) // ±13 cents
    lfo.connect(lfoDepth)
    lfoDepth.connect(osc1.detune)
    lfoDepth.connect(osc2.detune)
    lfoDepth.connect(osc3.detune)

    // Bow-bite low-pass: opens quickly on attack, then settles.
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.Q.value = 0.8
    lowpass.frequency.setValueAtTime(700, now)
    lowpass.frequency.linearRampToValueAtTime(Math.min(6000, frequency * 8), now + attack)
    lowpass.frequency.exponentialRampToValueAtTime(
      Math.min(3500, frequency * 5),
      now + attack + decay,
    )

    // Parallel body resonance (the instrument's bowl/membrane).
    const body = ctx.createBiquadFilter()
    body.type = 'bandpass'
    body.frequency.value = 420
    body.Q.value = 1.2
    const bodyGain = ctx.createGain()
    bodyGain.gain.value = 0.18

    // Amplitude ADSR.
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.linearRampToValueAtTime(peak, now + attack)
    amp.gain.exponentialRampToValueAtTime(sustain, now + attack + decay)
    const releaseStart = Math.max(now + attack + decay, now + dur - release)
    amp.gain.setValueAtTime(sustain, releaseStart)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    oscMix.connect(lowpass).connect(amp)
    oscMix.connect(body).connect(bodyGain).connect(amp)
    amp.connect(ctx.destination)

    // Bow-scratch transient at the onset.
    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    const noiseBp = ctx.createBiquadFilter()
    noiseBp.type = 'bandpass'
    noiseBp.frequency.value = Math.min(4000, frequency * 4)
    noiseBp.Q.value = 0.8
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.linearRampToValueAtTime(SYNTH_GAIN * 0.22, now + 0.012)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    noise.connect(noiseBp).connect(noiseGain).connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc3.start(now)
    lfo.start(now)
    noise.start(now)
    const end = now + dur
    osc1.stop(end)
    osc2.stop(end)
    osc3.stop(end)
    lfo.stop(end)
    noise.stop(now + 0.2)
  }

  function stopLoop() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function frame() {
    // Synth playback is timed against the AudioContext clock (sample-accurate,
    // in real seconds), so the highlight stays locked to what's sounding.
    const ctx = audioCtxRef.current
    const elapsed =
      isLocalVideo && videoRef.current
        ? videoRef.current.currentTime
        : ctx
          ? ctx.currentTime - startWallRef.current
          : seekRef.current

    if (elapsed >= total) {
      finishPlayback()
      return
    }

    // Current note = the last step whose start time has been reached.
    let idx = 0
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].start <= elapsed) idx = i
      else break
    }
    if (idx !== lastTriggeredRef.current) {
      lastTriggeredRef.current = idx
      setCurrentIndex(idx)
      if (!isLocalVideo) playTone(steps[idx].frequency, steps[idx].duration)
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
      // Anchor so that elapsed = ctx.currentTime - startWallRef, resuming from seek.
      startWallRef.current = ctx.currentTime - seekRef.current
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
      const ctx = audioCtxRef.current
      if (ctx) seekRef.current = ctx.currentTime - startWallRef.current
    }
    setIsPlaying(false)
  }

  function finishPlayback() {
    stopLoop()
    if (isLocalVideo && videoRef.current) videoRef.current.pause()
    seekRef.current = total
    setIsPlaying(false)
    setCurrentIndex(steps.length - 1)
  }

  function togglePlay() {
    if (isPlaying) pause()
    else play()
  }

  function seekToIndex(idx) {
    const clamped = Math.max(0, Math.min(idx, steps.length - 1))
    const time = steps[clamped].start
    seekRef.current = time
    lastTriggeredRef.current = -1
    setCurrentIndex(clamped)
    if (isLocalVideo && videoRef.current) {
      videoRef.current.currentTime = time
    } else if (isPlaying) {
      const ctx = audioCtxRef.current
      if (ctx) startWallRef.current = ctx.currentTime - time
    }
  }

  // Skip by musical phrase (tetrachord / four-note group), not single notes.
  function skipNext() {
    const next = phraseStarts.find((p) => p > currentIndex)
    seekToIndex(next ?? steps.length - 1)
  }

  function skipPrev() {
    const reversed = [...phraseStarts].reverse()
    const currentPhrase = reversed.find((p) => p <= currentIndex) ?? 0
    if (currentIndex > currentPhrase) {
      seekToIndex(currentPhrase)
    } else {
      const prev = reversed.find((p) => p < currentPhrase)
      seekToIndex(prev ?? 0)
    }
  }

  const progress = steps.length ? ((currentIndex + 1) / steps.length) * 100 : 0

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
        <span className="song__instruction-eyebrow">{step.instruction || 'נגנו יחד'}</span>
        <p className="song__instruction-text">{step.solfegeHe}</p>
      </div>

      {/* Timeline with the moving cursor */}
      <div className="song__timeline" dir="rtl">
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
