import { useEffect, useRef, useState } from 'react'
import { MAQAMS, DEFAULT_MAQAM, resolveHebrewNote } from '../data/maqams.js'
import { createKamanchehSampler } from '../audio/kamanchehSampler.js'
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

// Practice slow-down options (no pitch change).
const SPEEDS = [0.5, 0.75, 1]

// Hebrew labels for the on-screen "where to play" guidance.
const STRING_HE = { D5: 'מיתר רה׳', A4: 'מיתר לה', D4: 'מיתר רה', A3: 'מיתר לה׳' }
const FINGER_HE = { Open: 'פתוח', 1: 'אצבע 1', 2: 'אצבע 2', 3: 'אצבע 3', Pinky: 'זרת' }

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
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)

  const audioCtxRef = useRef(null)
  const samplerRef = useRef(null)
  const rafRef = useRef(null)
  const startWallRef = useRef(0) // real-time anchor: ctx.currentTime at the seek point
  const seekRef = useRef(0) // song-time position (seconds) at the anchor
  const lastTriggeredRef = useRef(-1)
  const videoRef = useRef(null)
  const speedRef = useRef(1)
  const loopRef = useRef(false)
  const loopStartRef = useRef(0)
  const loopEndRef = useRef(0)
  const timelineRef = useRef(null)

  const step = steps[currentIndex] || steps[0]

  // Tear down audio + animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // Keep the active note centred in the horizontally-scrolling timeline.
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const active = el.querySelector('.song__slot--active')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentIndex])

  function ensureCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      // Real-sample Kamancheh; loads its manifest in the background and falls
      // back to the synth until sample files are present.
      samplerRef.current = createKamanchehSampler(audioCtxRef.current)
      samplerRef.current.load().catch(() => {})
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

    // Prefer real recorded samples when available; otherwise synthesize below.
    if (samplerRef.current && samplerRef.current.play(frequency, now, dur)) {
      return
    }

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

  // Song-time elapsed (seconds). Synth is clocked off the AudioContext and
  // scaled by the practice speed so slowing down never changes pitch.
  function currentElapsed() {
    if (isLocalVideo && videoRef.current) return videoRef.current.currentTime
    const ctx = audioCtxRef.current
    if (!ctx) return seekRef.current
    return seekRef.current + (ctx.currentTime - startWallRef.current) * speedRef.current
  }

  // Move the playhead to a song-time position and re-anchor the active clock.
  function reanchor(time) {
    seekRef.current = time
    lastTriggeredRef.current = -1
    if (isLocalVideo && videoRef.current) {
      videoRef.current.currentTime = time
    } else {
      const ctx = audioCtxRef.current
      if (ctx) startWallRef.current = ctx.currentTime
    }
  }

  // The [start, end) song-time span of the phrase containing a note index.
  function phraseRange(idx) {
    const before = phraseStarts.filter((p) => p <= idx)
    const startIdx = before.length ? before[before.length - 1] : 0
    const nextIdx = phraseStarts.find((p) => p > startIdx)
    const startTime = steps[startIdx] ? steps[startIdx].start : 0
    const endTime = nextIdx != null && steps[nextIdx] ? steps[nextIdx].start : total
    return { startTime, endTime }
  }

  function setLoopRegion(idx) {
    const { startTime, endTime } = phraseRange(idx)
    loopStartRef.current = startTime
    loopEndRef.current = endTime
  }

  function frame() {
    const elapsed = currentElapsed()

    // Loop the selected phrase: jump back to its start at the end.
    if (loopRef.current && elapsed >= loopEndRef.current) {
      reanchor(loopStartRef.current)
      rafRef.current = requestAnimationFrame(frame)
      return
    }

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
      // Sustain across the (possibly slowed) real-time gap to the next note.
      if (!isLocalVideo) playTone(steps[idx].frequency, steps[idx].duration / speedRef.current)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  async function play() {
    if (seekRef.current >= total && !loopRef.current) {
      seekRef.current = 0
      setCurrentIndex(0)
      if (isLocalVideo && videoRef.current) videoRef.current.currentTime = 0
    }
    lastTriggeredRef.current = -1

    if (isLocalVideo) {
      const video = videoRef.current
      if (video) {
        video.playbackRate = speedRef.current
        video.preservesPitch = true
        try {
          await video.play()
        } catch {
          setVideoError(true)
        }
      }
    } else {
      const ctx = ensureCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      startWallRef.current = ctx.currentTime // elapsed = seekRef + (now-anchor)*speed
    }

    setIsPlaying(true)
    stopLoop()
    rafRef.current = requestAnimationFrame(frame)
  }

  function pause() {
    if (!isLocalVideo) seekRef.current = currentElapsed()
    stopLoop()
    if (isLocalVideo && videoRef.current) videoRef.current.pause()
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

  // Change practice speed without changing pitch.
  function changeSpeed(value) {
    if (isPlaying && !isLocalVideo) {
      // Re-anchor so the new rate applies from the current position.
      seekRef.current = currentElapsed()
      const ctx = audioCtxRef.current
      if (ctx) startWallRef.current = ctx.currentTime
    }
    if (isLocalVideo && videoRef.current) {
      videoRef.current.playbackRate = value
      videoRef.current.preservesPitch = true
    }
    speedRef.current = value
    setSpeed(value)
  }

  function toggleLoop() {
    const next = !loop
    setLoop(next)
    loopRef.current = next
    if (next) {
      setLoopRegion(currentIndex)
      reanchor(loopStartRef.current)
      const before = phraseStarts.filter((p) => p <= currentIndex)
      setCurrentIndex(before.length ? before[before.length - 1] : 0)
    }
  }

  function seekToIndex(idx) {
    const clamped = Math.max(0, Math.min(idx, steps.length - 1))
    reanchor(steps[clamped].start)
    setCurrentIndex(clamped)
  }

  // Skip by musical phrase (tetrachord / four-note group). While looping, this
  // also moves which phrase repeats.
  function skipNext() {
    const next = phraseStarts.find((p) => p > currentIndex) ?? steps.length - 1
    seekToIndex(next)
    if (loopRef.current) setLoopRegion(next)
  }

  function skipPrev() {
    const reversed = [...phraseStarts].reverse()
    const currentPhrase = reversed.find((p) => p <= currentIndex) ?? 0
    const target =
      currentIndex > currentPhrase
        ? currentPhrase
        : reversed.find((p) => p < currentPhrase) ?? 0
    seekToIndex(target)
    if (loopRef.current) setLoopRegion(target)
  }

  const progress = steps.length ? ((currentIndex + 1) / steps.length) * 100 : 0
  const nextStep = steps[currentIndex + 1]
  const placement = (s) => `${STRING_HE[s.string] || s.string} · ${FINGER_HE[s.finger] || ''}`

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

      {/* Pedagogical guide: what to play, where, and what's next */}
      <div className="song__guide" dir="rtl" lang="he">
        <div className="song__guide-main">
          <span className="song__guide-note">{step.solfegeHe}</span>
          <span className="song__guide-where">{placement(step)}</span>
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

      {/* String + finger map, synced to the elapsed time. The active finger
          shows the Hebrew Solfège note so the eye lands on where to play. */}
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
                  return (
                    <span
                      key={f.id}
                      className={`song__finger ${active ? 'song__finger--active' : ''}`}
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

      {/* Practice tools: slow down (no pitch change) + loop a phrase */}
      <div className="song__practice" dir="rtl" lang="he">
        <div className="song__speeds" role="group" aria-label="מהירות נגינה">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`song__speed ${speed === s ? 'song__speed--active' : ''}`}
              onClick={() => changeSpeed(s)}
            >
              {Math.round(s * 100)}%
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`song__loop ${loop ? 'song__loop--active' : ''}`}
          aria-pressed={loop}
          onClick={toggleLoop}
        >
          🔁 חזרה על משפט
        </button>
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
