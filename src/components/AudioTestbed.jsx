import { useEffect, useRef, useState } from 'react'
import './AudioTestbed.css'

// Number of samples we analyse per frame. A power of two is required by the
// Web Audio AnalyserNode. 2048 gives a good balance of accuracy vs. speed.
const FFT_SIZE = 2048

// Below this volume (root-mean-square) we treat the signal as silence and
// don't report a pitch, so background noise doesn't produce junk readings.
const SILENCE_RMS = 0.01

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

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

/** Convert a frequency in Hz to the nearest musical note and cents offset. */
function frequencyToNote(frequency) {
  // MIDI note number, where A4 (440 Hz) = 69.
  const noteNumber = 12 * Math.log2(frequency / 440) + 69
  const rounded = Math.round(noteNumber)
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]
  const octave = Math.floor(rounded / 12) - 1
  const cents = Math.round((noteNumber - rounded) * 100)
  return { label: `${name}${octave}`, cents }
}

export default function AudioTestbed() {
  const [isListening, setIsListening] = useState(false)
  const [frequency, setFrequency] = useState(null)
  const [note, setNote] = useState(null)
  const [error, setError] = useState(null)

  // Audio + animation handles live in refs so they survive re-renders
  // without triggering them.
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const bufferRef = useRef(null)
  const canvasRef = useRef(null)

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

  function tick() {
    const analyser = analyserRef.current
    const buffer = bufferRef.current
    const audioContext = audioContextRef.current
    if (!analyser || !buffer || !audioContext) return

    analyser.getFloatTimeDomainData(buffer)
    drawWaveform(buffer)

    const pitch = autoCorrelate(buffer, audioContext.sampleRate)
    if (pitch !== -1) {
      setFrequency(pitch)
      setNote(frequencyToNote(pitch))
    } else {
      setFrequency(null)
      setNote(null)
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
    setIsListening(false)
    setFrequency(null)
    setNote(null)
  }

  return (
    <section className="testbed">
      <header className="testbed__header">
        <h1 className="testbed__title">Audio Testbed</h1>
        <p className="testbed__subtitle">Pitch detection &amp; live waveform</p>
      </header>

      <div className="testbed__readout">
        <div className="testbed__freq">
          {frequency ? frequency.toFixed(1) : '—'}
          <span className="testbed__unit">Hz</span>
        </div>
        <div className="testbed__note">
          {note ? (
            <>
              <span className="testbed__note-label">{note.label}</span>
              <span className="testbed__cents">
                {note.cents > 0 ? `+${note.cents}` : note.cents} cents
              </span>
            </>
          ) : (
            <span className="testbed__note-idle">
              {isListening ? 'Play a note…' : 'Not listening'}
            </span>
          )}
        </div>
      </div>

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
