import { useEffect, useRef, useState } from 'react'
import './AudioTestbed.css'

// Number of samples we analyse per frame. A power of two is required by the
// Web Audio AnalyserNode. 2048 gives a good balance of accuracy vs. speed.
const FFT_SIZE = 2048

// Below this volume (root-mean-square) we treat the signal as silence and
// don't report a pitch, so background noise doesn't produce junk readings.
const SILENCE_RMS = 0.01

// English letter names and their fixed-do Solfège equivalents, indexed by
// semitone within an octave (0 = C).
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SOLFEGE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

// The four open strings of the Azerbaijani Kamancheh, in scientific pitch
// notation. We highlight these so the player can recognise them at a glance.
const OPEN_STRINGS = ['A3', 'D4', 'A4', 'D5']

// A pitch is considered "perfectly in tune" at 0 cents and fully out of tune
// at this many cents away — used to drive the red → green tuning colour.
const CENTS_TOLERANCE = 50

/**
 * Map a cents deviation to a tuning colour using HSL:
 *   0 cents  -> hue 120 (vibrant green, in tune)
 *  25 cents  -> hue 60  (yellow)
 *  50+ cents -> hue 0   (red, out of tune)
 * `lightness` lets callers build gradients/glows from the same hue.
 */
function centsToColor(cents, lightness = 50) {
  const offset = Math.min(Math.abs(cents), CENTS_TOLERANCE)
  const hue = (1 - offset / CENTS_TOLERANCE) * 120
  return `hsl(${hue}, 85%, ${lightness}%)`
}

/**
 * Estimate the fundamental frequency of a time-domain buffer using
 * autocorrelation. Returns the frequency in Hz, or -1 if no clear pitch
 * (e.g. silence or noise) is found.
 *
 * This is a lightly adapted version of the well-known ACF2+ algorithm.
 */
function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length

  // 1. Bail out early if the signal is too quiet to be a real note.
  let rms = 0
  for (let i = 0; i < size; i++) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / size)
  if (rms < SILENCE_RMS) return -1

  // 2. Trim quiet edges of the buffer to focus on the sustained tone.
  let start = 0
  let end = size - 1
  const threshold = 0.2
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      start = i
      break
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < threshold) {
      end = size - i
      break
    }
  }

  const trimmed = buffer.slice(start, end)
  const trimmedSize = trimmed.length

  // 3. Compute the autocorrelation: how well the signal matches a
  //    time-shifted copy of itself at each possible lag.
  const correlations = new Array(trimmedSize).fill(0)
  for (let lag = 0; lag < trimmedSize; lag++) {
    for (let i = 0; i < trimmedSize - lag; i++) {
      correlations[lag] += trimmed[i] * trimmed[i + lag]
    }
  }

  // 4. Find the first dip, then the highest peak after it — that peak's
  //    position (the lag) corresponds to one period of the waveform.
  let dip = 0
  while (correlations[dip] > correlations[dip + 1]) dip++

  let maxValue = -1
  let maxLag = -1
  for (let i = dip; i < trimmedSize; i++) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i]
      maxLag = i
    }
  }

  let period = maxLag

  // 5. Parabolic interpolation around the peak for sub-sample precision.
  const x1 = correlations[period - 1]
  const x2 = correlations[period]
  const x3 = correlations[period + 1]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  if (a) period = period - b / (2 * a)

  if (period <= 0) return -1
  return sampleRate / period
}

/**
 * Convert a frequency in Hz to the nearest musical note.
 * Returns the English letter, Solfège name, octave, a combined
 * "Solfège / English" label, the scientific name (e.g. "D4"), the cents
 * offset from perfect pitch, and whether it is a Kamancheh open string.
 */
function frequencyToNote(frequency) {
  // MIDI note number, where A4 (440 Hz) = 69.
  const noteNumber = 12 * Math.log2(frequency / 440) + 69
  const rounded = Math.round(noteNumber)
  const semitone = ((rounded % 12) + 12) % 12
  const english = NOTE_NAMES[semitone]
  const solfege = SOLFEGE_NAMES[semitone]
  const octave = Math.floor(rounded / 12) - 1
  const scientific = `${english}${octave}`
  const cents = Math.round((noteNumber - rounded) * 100)
  return {
    english,
    solfege,
    octave,
    scientific,
    combined: `${solfege} / ${english}`,
    cents,
    isOpenString: OPEN_STRINGS.includes(scientific),
  }
}

// How close (in cents) counts as "in tune" while holding a target, and the
// default time it must be sustained before the target is considered passed.
const IN_TUNE_CENTS = 15
const DEFAULT_HOLD_MS = 1200

/**
 * Reusable pitch tuner with a colour-changing accuracy indicator and live
 * waveform.
 *
 * Props:
 *   target  – optional { id, label, frequency }. When given, the indicator is
 *             calibrated to that exact frequency (microtonal-aware), so it works
 *             for notes like the Shur E half-flat that aren't on a piano.
 *   onPass  – optional callback fired once when the player holds `target` in
 *             tune long enough to pass it.
 *   holdMs  – how long the target must be held in tune to pass (default 1200).
 */
export default function AudioTestbed({
  target = null,
  onPass,
  holdMs = DEFAULT_HOLD_MS,
}) {
  const [isListening, setIsListening] = useState(false)
  const [reading, setReading] = useState(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [error, setError] = useState(null)

  const practiceMode = Boolean(target)

  // Audio + animation handles live in refs so they survive re-renders
  // without triggering them.
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const bufferRef = useRef(null)
  const canvasRef = useRef(null)

  // Latest props mirrored into refs so the long-running rAF loop never reads
  // stale values from the closure it was started with.
  const targetRef = useRef(target)
  const onPassRef = useRef(onPass)
  const holdMsRefProp = useRef(holdMs)
  useEffect(() => {
    targetRef.current = target
  }, [target])
  useEffect(() => {
    onPassRef.current = onPass
  }, [onPass])
  useEffect(() => {
    holdMsRefProp.current = holdMs
  }, [holdMs])

  // Hold-to-pass bookkeeping.
  const activeTargetIdRef = useRef(null)
  const holdMsRef = useRef(0)
  const passedRef = useRef(false)
  const lastTsRef = useRef(0)

  // Always tear everything down when the component unmounts.
  useEffect(() => {
    return () => stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawWaveform(buffer) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // Match the canvas backing store to its displayed size for crisp lines.
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, width, height)

    // Centre line.
    ctx.strokeStyle = '#2a2a31'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    // Waveform.
    ctx.strokeStyle = '#5eead4'
    ctx.lineWidth = 2
    ctx.beginPath()
    const step = width / buffer.length
    for (let i = 0; i < buffer.length; i++) {
      const x = i * step
      const y = (0.5 - buffer[i] * 0.5) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  function tick(timestamp) {
    const analyser = analyserRef.current
    const buffer = bufferRef.current
    const audioContext = audioContextRef.current
    if (!analyser || !buffer || !audioContext) return

    analyser.getFloatTimeDomainData(buffer)
    drawWaveform(buffer)

    const activeTarget = targetRef.current

    // Reset hold tracking whenever the active target changes.
    const targetId = activeTarget ? activeTarget.id : null
    if (targetId !== activeTargetIdRef.current) {
      activeTargetIdRef.current = targetId
      holdMsRef.current = 0
      passedRef.current = false
      setHoldProgress(0)
    }

    const now = timestamp || performance.now()
    const dt = lastTsRef.current ? now - lastTsRef.current : 0
    lastTsRef.current = now

    const pitch = autoCorrelate(buffer, audioContext.sampleRate)

    if (pitch === -1) {
      // Silence: pause progress (so brief bow lifts don't reset it) and clear
      // the readout, but keep any accumulated hold time.
      setReading(null)
    } else if (activeTarget) {
      // Practice mode: measure deviation from the exact target frequency.
      const cents = Math.round(1200 * Math.log2(pitch / activeTarget.frequency))
      setReading({ frequency: pitch, cents, label: activeTarget.label })

      if (Math.abs(cents) <= IN_TUNE_CENTS) {
        holdMsRef.current += dt
      } else {
        holdMsRef.current = 0
      }
      const progress = Math.min(holdMsRef.current / holdMsRefProp.current, 1)
      setHoldProgress(progress)
      if (progress >= 1 && !passedRef.current) {
        passedRef.current = true
        if (onPassRef.current) onPassRef.current()
      }
    } else {
      // Free mode: report the nearest equal-tempered note.
      const n = frequencyToNote(pitch)
      setReading({
        frequency: pitch,
        cents: n.cents,
        label: n.combined,
        octave: n.octave,
        scientific: n.scientific,
        isOpenString: n.isOpenString,
      })
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  async function startListening() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      // Mobile browsers start contexts suspended until a user gesture.
      if (audioContext.state === 'suspended') await audioContext.resume()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = FFT_SIZE
      source.connect(analyser)
      analyserRef.current = analyser

      bufferRef.current = new Float32Array(analyser.fftSize)

      setIsListening(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setError(
        err && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow it and try again.'
          : 'Could not start the microphone. Make sure the page is served over HTTPS or localhost.',
      )
    }
  }

  function stopListening() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    bufferRef.current = null
    holdMsRef.current = 0
    passedRef.current = false
    lastTsRef.current = 0
    activeTargetIdRef.current = null
    setIsListening(false)
    setReading(null)
    setHoldProgress(0)
  }

  const inTune = practiceMode && reading && Math.abs(reading.cents) <= IN_TUNE_CENTS

  return (
    <section className="testbed">
      {!practiceMode && (
        <header className="testbed__header">
          <h1 className="testbed__title">Audio Testbed</h1>
          <p className="testbed__subtitle">Pitch detection &amp; live waveform</p>
        </header>
      )}

      <div className="testbed__indicator-wrap">
        <div
          className="testbed__indicator"
          style={
            reading
              ? {
                  background: `radial-gradient(circle at 50% 38%, ${centsToColor(
                    reading.cents,
                    60,
                  )}, ${centsToColor(reading.cents, 38)})`,
                  boxShadow: `0 0 70px 6px ${centsToColor(reading.cents, 50)}`,
                  borderColor: centsToColor(reading.cents, 55),
                }
              : undefined
          }
        >
          {reading ? (
            <>
              <span className="testbed__indicator-note">
                {reading.label}
                {reading.octave !== undefined && (
                  <span className="testbed__octave">{reading.octave}</span>
                )}
              </span>
              <span className="testbed__indicator-cents">
                {reading.cents > 0 ? `+${reading.cents}` : reading.cents} cents
              </span>
              {practiceMode && inTune && (
                <span className="testbed__open-badge">In tune</span>
              )}
              {!practiceMode && reading.isOpenString && (
                <span className="testbed__open-badge">Open string</span>
              )}
            </>
          ) : (
            <span className="testbed__indicator-idle">
              {practiceMode
                ? isListening
                  ? `Play ${target.label}`
                  : target.label
                : isListening
                  ? 'Play a note…'
                  : 'Not listening'}
            </span>
          )}
        </div>
      </div>

      {practiceMode && (
        <div className="testbed__hold">
          <div
            className="testbed__hold-fill"
            style={{
              width: `${Math.round(holdProgress * 100)}%`,
              background: centsToColor(reading ? reading.cents : 50, 50),
            }}
          />
        </div>
      )}

      <div className="testbed__freq">
        {reading ? reading.frequency.toFixed(1) : '—'}
        <span className="testbed__unit">Hz</span>
      </div>

      {!practiceMode && (
        <div className="testbed__strings">
          <span className="testbed__strings-label">Open strings</span>
          <div className="testbed__strings-list">
            {OPEN_STRINGS.map((s) => (
              <span
                key={s}
                className={`testbed__string ${
                  reading && reading.scientific === s
                    ? 'testbed__string--active'
                    : ''
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="testbed__canvas" />

      {error && <p className="testbed__error">{error}</p>}

      <button
        type="button"
        className={`testbed__button ${isListening ? 'testbed__button--stop' : ''}`}
        onClick={isListening ? stopListening : startListening}
      >
        {isListening ? 'Stop' : 'Enable Microphone'}
      </button>
    </section>
  )
}
