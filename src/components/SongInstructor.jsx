import { useEffect, useRef, useState } from 'react'
import { MAQAMS, DEFAULT_MAQAM } from '../data/maqams.js'
import { createKamanchehSampler } from '../audio/kamanchehSampler.js'
import {
  stepsFromTranscript,
  withDurations,
  totalDuration,
  indexAtTime,
  phraseStartsEvery,
  applyOpenStringPreference,
} from '../audio/steps.js'
import {
  createRhythmEngine,
  AZERBAIJANI_RHYTHMS,
  DEFAULT_RHYTHM,
} from '../audio/azerbaijaniRhythms.js'
import FingeringGuide from './FingeringGuide.jsx'
import './SongInstructor.css'

// Playback tempo for synth scales/melodies: each note lasts this many seconds.
const NOTE_SECONDS = 0.9
const SYNTH_GAIN = 0.22

// Practice slow-down options (no pitch change).
const SPEEDS = [0.5, 0.75, 1]

// Curriculum melodies are written as scientific note names; map each to the
// fingerboard placement so a stage melody can drive the instructor overlay.
const MELODY_NOTE = {
  D4: { solfegeHe: 'רה', string: 'D4', finger: 'Open' },
  E4: { solfegeHe: 'מי', string: 'D4', finger: '1' },
  F4: { solfegeHe: 'פה', string: 'D4', finger: '2' },
  G4: { solfegeHe: 'סול', string: 'D4', finger: '3' },
  A4: { solfegeHe: 'לה', string: 'D4', finger: 'Pinky' },
}

// A short white-noise buffer (cached on the AudioContext) used for the bow
// "scratch" transient at the start of each synth note.
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

/**
 * Note-based instructor. Highlights which string + finger + note to play on a
 * virtual fingerboard, synced to playback. Two playback sources:
 *   - Uploaded audio (song.source === 'upload'): plays the student's ORIGINAL
 *     recording and overlays the notes transcribed from it.
 *   - Synth (curriculum stages, or songs without media): plays a clean bowed
 *     synth of the maqam scale or the stage melody.
 *
 * Local teacher videos are handled by <VideoLesson> instead (no fabricated
 * fingering overlay), so this component never deals with <video>.
 *
 * Props: stage?, song?, onComplete(stageId)?, onExit().
 */
export default function SongInstructor({ stage, song, onComplete, onExit }) {
  const maqamId = (song && song.maqam) || DEFAULT_MAQAM
  const maqam = MAQAMS[maqamId] || MAQAMS[DEFAULT_MAQAM]

  // An uploaded recording can be played two ways:
  //   - 'kamancheh' (default): re-play the song on the Kamancheh synth from its
  //     transcribed notes — i.e. translate the recording into Kamancheh playing.
  //   - 'original': play the student's actual recording, for comparison.
  const audioUrl = song && song.source === 'upload' ? song.audioUrl : null
  const isUpload = Boolean(audioUrl)

  // Note source priority: transcribed song notes → stage melody → maqam scale.
  const aiNotes =
    song && Array.isArray(song.notes) && song.notes.length > 0 ? song.notes : null

  let steps
  let phraseStarts
  if (aiNotes) {
    steps = stepsFromTranscript(aiNotes)
    phraseStarts = phraseStartsEvery(steps)
  } else if (stage && Array.isArray(stage.melody) && stage.melody.length > 0) {
    const base = stage.melody.map((m, i) => {
      const placement = MELODY_NOTE[m.short] || MELODY_NOTE.D4
      return {
        solfegeHe: placement.solfegeHe,
        english: m.short,
        frequency: m.frequency,
        string: placement.string,
        finger: placement.finger,
        instruction: '',
        start: i * NOTE_SECONDS,
      }
    })
    steps = withDurations(base)
    phraseStarts = phraseStartsEvery(steps)
  } else {
    const base = maqam.notes.map((n, i) => ({ ...n, start: i * NOTE_SECONDS }))
    steps = withDurations(base)
    phraseStarts = maqam.phraseStarts
  }

  // Let Sol (G4) ring on the open G string where the phrase calls for it instead
  // of always forcing the 3rd finger on the D string.
  steps = applyOpenStringPreference(steps, phraseStarts)

  const total = totalDuration(steps)

  const headerLabel = song ? song.title : `שלב ${stage.number} · ${maqam.nameHe}`
  const backLabel = song ? '→ ספרייה' : '→ מסלול'

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  // 'kamancheh' = synth rendition of the notes · 'original' = the recording.
  const [playbackMode, setPlaybackMode] = useState('kamancheh')
  // Traditional Azerbaijani rhythmic accompaniment (off by default).
  const [backing, setBacking] = useState(false)
  const [rhythmId, setRhythmId] = useState(DEFAULT_RHYTHM)

  // Backing-track tempo: the transcribed song's BPM if known, else a sensible
  // default groove. Scaled by the practice speed so slowing down slows the beat.
  const backingBpm = (song && song.bpm) || 92

  // The original recording drives the clock only when explicitly selected; in
  // every other case (the default for uploads, and all synth scales/melodies)
  // playback is the Kamancheh synth reading the transcribed notes.
  const hasAudio = isUpload && playbackMode === 'original'
  const isSynth = !hasAudio

  const audioCtxRef = useRef(null)
  const samplerRef = useRef(null)
  const rhythmEngineRef = useRef(null)
  const rafRef = useRef(null)
  const startWallRef = useRef(0) // real-time anchor: ctx.currentTime at the seek point
  const seekRef = useRef(0) // song-time position (seconds) at the anchor
  const lastTriggeredRef = useRef(-1)
  const audioElRef = useRef(null) // <audio> for uploaded recordings
  const speedRef = useRef(1)
  const loopRef = useRef(false)
  const loopStartRef = useRef(0)
  const loopEndRef = useRef(0)

  // Tear down audio + animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (rhythmEngineRef.current) rhythmEngineRef.current.stop()
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  function ensureCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      samplerRef.current = createKamanchehSampler(audioCtxRef.current)
      samplerRef.current.load().catch(() => {})
      rhythmEngineRef.current = createRhythmEngine(audioCtxRef.current)
    }
    return audioCtxRef.current
  }

  // Start/stop the rhythmic accompaniment, tied to the current tempo so slowing
  // down the practice speed also slows the groove.
  function startBacking() {
    const ctx = ensureCtx()
    if (ctx.state === 'suspended') ctx.resume()
    rhythmEngineRef.current.start(backingBpm * speedRef.current, rhythmId)
  }

  function stopBacking() {
    if (rhythmEngineRef.current) rhythmEngineRef.current.stop()
  }

  // A bowed-string (Kamancheh) synth voice (only used when there's no real
  // audio recording to play).
  function playTone(frequency, duration = NOTE_SECONDS) {
    const ctx = ensureCtx()
    const now = ctx.currentTime
    const dur = Math.min(Math.max(duration, 0.12), 3.0)

    if (samplerRef.current && samplerRef.current.play(frequency, now, dur)) {
      return
    }

    const peak = SYNTH_GAIN
    const sustain = SYNTH_GAIN * 0.75
    const attack = Math.min(0.08, dur * 0.3)
    const decay = Math.min(0.12, dur * 0.3)
    const release = Math.min(0.12, dur * 0.3)

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

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.5
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.setValueAtTime(0, now)
    lfoDepth.gain.linearRampToValueAtTime(13, now + Math.min(0.25, dur * 0.5))
    lfo.connect(lfoDepth)
    lfoDepth.connect(osc1.detune)
    lfoDepth.connect(osc2.detune)
    lfoDepth.connect(osc3.detune)

    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.Q.value = 0.8
    lowpass.frequency.setValueAtTime(700, now)
    lowpass.frequency.linearRampToValueAtTime(Math.min(6000, frequency * 8), now + attack)
    lowpass.frequency.exponentialRampToValueAtTime(
      Math.min(3500, frequency * 5),
      now + attack + decay,
    )

    const body = ctx.createBiquadFilter()
    body.type = 'bandpass'
    body.frequency.value = 420
    body.Q.value = 1.2
    const bodyGain = ctx.createGain()
    bodyGain.gain.value = 0.18

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

  // Song-time elapsed (seconds). Real audio uses the element's clock; the synth
  // is clocked off the AudioContext and scaled by the practice speed so slowing
  // down never changes pitch.
  function currentElapsed() {
    if (hasAudio && audioElRef.current) return audioElRef.current.currentTime
    const ctx = audioCtxRef.current
    if (!ctx) return seekRef.current
    return seekRef.current + (ctx.currentTime - startWallRef.current) * speedRef.current
  }

  // Move the playhead to a song-time position and re-anchor the active clock.
  function reanchor(time) {
    seekRef.current = time
    lastTriggeredRef.current = -1
    if (hasAudio && audioElRef.current) {
      audioElRef.current.currentTime = time
    } else {
      const ctx = audioCtxRef.current
      if (ctx) startWallRef.current = ctx.currentTime
    }
  }

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

    if (loopRef.current && elapsed >= loopEndRef.current) {
      reanchor(loopStartRef.current)
      rafRef.current = requestAnimationFrame(frame)
      return
    }

    if (elapsed >= total) {
      finishPlayback()
      return
    }

    const idx = indexAtTime(steps, elapsed)
    if (idx !== lastTriggeredRef.current) {
      lastTriggeredRef.current = idx
      setCurrentIndex(idx)
      // Only the synth needs note triggers; real audio plays itself.
      if (isSynth) playTone(steps[idx].frequency, steps[idx].duration / speedRef.current)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  async function play() {
    if (seekRef.current >= total && !loopRef.current) {
      seekRef.current = 0
      setCurrentIndex(0)
      if (hasAudio && audioElRef.current) audioElRef.current.currentTime = 0
    }
    lastTriggeredRef.current = -1

    if (hasAudio) {
      const el = audioElRef.current
      if (el) {
        el.playbackRate = speedRef.current
        el.preservesPitch = true
        try {
          await el.play()
        } catch {
          // Autoplay/user-gesture issues — leave paused; the button stays available.
        }
      }
    } else {
      const ctx = ensureCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      // Wait for the real Kamancheh samples before the clock starts, so even the
      // first note plays the sampled instrument instead of the synth fallback.
      if (samplerRef.current) {
        try {
          await samplerRef.current.load()
        } catch {
          // Couldn't load samples — playback continues on the synth fallback.
        }
      }
      startWallRef.current = ctx.currentTime
    }

    if (backing) startBacking()
    setIsPlaying(true)
    stopLoop()
    rafRef.current = requestAnimationFrame(frame)
  }

  function pause() {
    if (isSynth) seekRef.current = currentElapsed()
    stopLoop()
    stopBacking()
    if (hasAudio && audioElRef.current) audioElRef.current.pause()
    setIsPlaying(false)
  }

  function finishPlayback() {
    stopLoop()
    stopBacking()
    if (hasAudio && audioElRef.current) audioElRef.current.pause()
    seekRef.current = total
    setIsPlaying(false)
    setCurrentIndex(steps.length - 1)
  }

  function togglePlay() {
    if (isPlaying) pause()
    else play()
  }

  function changeSpeed(value) {
    if (isPlaying && isSynth) {
      seekRef.current = currentElapsed()
      const ctx = audioCtxRef.current
      if (ctx) startWallRef.current = ctx.currentTime
    }
    if (hasAudio && audioElRef.current) {
      audioElRef.current.playbackRate = value
      audioElRef.current.preservesPitch = true
    }
    speedRef.current = value
    setSpeed(value)
    if (rhythmEngineRef.current && rhythmEngineRef.current.isPlaying()) {
      rhythmEngineRef.current.setBpm(backingBpm * value)
    }
  }

  // Toggle the Azerbaijani backing track. If enabled mid-playback, start it now;
  // if disabled, stop it immediately.
  function toggleBacking() {
    const next = !backing
    setBacking(next)
    if (next) {
      if (isPlaying) startBacking()
    } else {
      stopBacking()
    }
  }

  function changeRhythm(id) {
    setRhythmId(id)
    if (rhythmEngineRef.current && rhythmEngineRef.current.isPlaying()) {
      rhythmEngineRef.current.start(backingBpm * speedRef.current, id)
    }
  }

  // Switch how an uploaded song is played (Kamancheh synth vs. the original
  // recording). Stop first and re-anchor both clocks to the current phrase so
  // the audio element and the synth clock never run at the same time.
  function changeMode(mode) {
    if (mode === playbackMode) return
    if (isPlaying) pause()
    const pos = steps[currentIndex] ? steps[currentIndex].start : 0
    seekRef.current = pos
    lastTriggeredRef.current = -1
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.currentTime = pos
    }
    const ctx = audioCtxRef.current
    if (ctx) startWallRef.current = ctx.currentTime
    setPlaybackMode(mode)
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

      {/* Media: an uploaded recording (rendered on Kamancheh or as the
          original), or a synth indicator for scales/melodies. */}
      <div className="song__media">
        {isUpload ? (
          <div className="song__synth">
            <span className="song__synth-badge" dir="rtl" lang="he">
              {hasAudio
                ? `🎵 ההקלטה המקורית · ${maqam.nameHe}`
                : `🎻 בנגינת קמנצ׳ה · ${maqam.nameHe}`}
            </span>
            {/* Kept mounted in both modes so switching to the original is instant. */}
            <audio
              ref={audioElRef}
              src={audioUrl}
              onEnded={finishPlayback}
              preload="auto"
            />
          </div>
        ) : (
          <div className="song__synth">
            <span className="song__synth-badge" dir="rtl" lang="he">
              ♪ מנוגן בסינתיסייזר · {maqam.nameHe}
            </span>
          </div>
        )}
      </div>

      <FingeringGuide steps={steps} currentIndex={currentIndex} />

      {/* For uploads: choose between the Kamancheh rendition and the original. */}
      {isUpload && (
        <div className="song__practice" dir="rtl" lang="he">
          <div className="song__speeds" role="group" aria-label="אופן נגינה">
            <button
              type="button"
              className={`song__speed ${playbackMode === 'kamancheh' ? 'song__speed--active' : ''}`}
              onClick={() => changeMode('kamancheh')}
            >
              🎻 קמנצ׳ה
            </button>
            <button
              type="button"
              className={`song__speed ${playbackMode === 'original' ? 'song__speed--active' : ''}`}
              onClick={() => changeMode('original')}
            >
              🎵 מקור
            </button>
          </div>
        </div>
      )}

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

      {/* Traditional Azerbaijani rhythmic accompaniment (Yalli / Shalaho / …) */}
      <div className="song__practice song__backing" dir="rtl" lang="he">
        <button
          type="button"
          className={`song__loop ${backing ? 'song__loop--active' : ''}`}
          aria-pressed={backing}
          onClick={toggleBacking}
        >
          🥁 ליווי מקצבי
        </button>
        <label className="song__backing-select-wrap">
          <span className="song__backing-label">מקצב</span>
          <select
            className="song__backing-select"
            value={rhythmId}
            onChange={(e) => changeRhythm(e.target.value)}
          >
            {AZERBAIJANI_RHYTHMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameHe} · {r.meter}
              </option>
            ))}
          </select>
        </label>
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
          aria-label="המשפט הקודם"
        >
          ⏪
        </button>
        <button
          type="button"
          className="song__ctrl song__ctrl--play"
          onClick={togglePlay}
          aria-label={isPlaying ? 'השהיה' : 'נגינה'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="song__ctrl"
          onClick={skipNext}
          aria-label="המשפט הבא"
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
