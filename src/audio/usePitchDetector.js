import { useCallback, useEffect, useRef, useState } from 'react'
import { autoCorrelate, computeRms } from './pitch.js'

// Number of samples analysed per frame. A power of two is required by the
// AnalyserNode; 2048 balances accuracy and speed.
const FFT_SIZE = 2048

/**
 * Manage the microphone + Web Audio lifecycle and run pitch detection on every
 * animation frame. The consumer supplies an `onFrame` callback and receives the
 * raw waveform buffer, detected frequency (Hz, or -1 for silence), RMS volume
 * and a timestamp — leaving all UI/scoring decisions to the caller.
 *
 * Returns { isListening, error, start, stop }.
 */
export function usePitchDetector({ onFrame } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const bufferRef = useRef(null)

  // Mirror the latest callback so the rAF loop never calls a stale closure.
  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  const stop = useCallback(() => {
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
  }, [])

  const tick = useCallback((timestamp) => {
    const analyser = analyserRef.current
    const buffer = bufferRef.current
    const audioContext = audioContextRef.current
    if (!analyser || !buffer || !audioContext) return

    analyser.getFloatTimeDomainData(buffer)
    const frequency = autoCorrelate(buffer, audioContext.sampleRate)
    const rms = computeRms(buffer)

    if (onFrameRef.current) {
      onFrameRef.current({
        buffer,
        frequency,
        rms,
        sampleRate: audioContext.sampleRate,
        timestamp: timestamp || performance.now(),
      })
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const start = useCallback(async () => {
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
  }, [tick])

  // Tear everything down on unmount.
  useEffect(() => () => stop(), [stop])

  return { isListening, error, start, stop }
}
