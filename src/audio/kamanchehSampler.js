// Sample-based Kamancheh instrument (SCAFFOLDING — not yet wired into playback).
//
// This is the path to a truly realistic, "identical to a real instrument" sound:
// play back short recordings of actual Kamancheh notes, pitch-shifted to the
// target frequency, instead of synthesizing the timbre.
//
// To activate (next session):
//   1. Drop recorded note samples into  public/samples/kamancheh/  (e.g. D4.mp3,
//      G4.mp3, A4.mp3, D5.mp3 — a handful spread across the range is enough).
//   2. List them in SAMPLE_MANIFEST below.
//   3. In SongInstructor: create one sampler with createKamanchehSampler(ctx),
//      call `await sampler.load()` once, and in playTone do
//      `if (!sampler.play(frequency, ctx.currentTime, dur)) { ...existing synth... }`
//      so it falls back to the synth whenever a sample isn't available.

export const SAMPLE_MANIFEST = [
  // { frequency: 293.66, url: '/samples/kamancheh/D4.mp3' }, // Re
  // { frequency: 392.0,  url: '/samples/kamancheh/G4.mp3' }, // Sol
  // { frequency: 440.0,  url: '/samples/kamancheh/A4.mp3' }, // La
  // { frequency: 587.33, url: '/samples/kamancheh/D5.mp3' }, // Re (octave)
]

/**
 * Create a sampler bound to an AudioContext. Returns:
 *   load()    -> Promise<boolean>  fetch + decode all manifest samples
 *   isReady() -> boolean
 *   play(frequency, when, duration, destination?) -> boolean
 *       picks the nearest sample, pitch-shifts it via playbackRate, applies a
 *       short release, and plays it. Returns false if no samples are loaded so
 *       the caller can fall back to the synth.
 */
export function createKamanchehSampler(ctx) {
  const buffers = [] // { frequency, buffer }, sorted by frequency
  let ready = false

  async function load() {
    if (SAMPLE_MANIFEST.length === 0) return false
    await Promise.all(
      SAMPLE_MANIFEST.map(async (sample) => {
        const res = await fetch(sample.url)
        const arrayBuffer = await res.arrayBuffer()
        const buffer = await ctx.decodeAudioData(arrayBuffer)
        buffers.push({ frequency: sample.frequency, buffer })
      }),
    )
    buffers.sort((a, b) => a.frequency - b.frequency)
    ready = buffers.length > 0
    return ready
  }

  function isReady() {
    return ready
  }

  // Beyond this much pitch-shift a single sample sounds unnatural; let the
  // caller fall back to the synth instead.
  const MAX_SHIFT_CENTS = 700
  const centsBetween = (a, b) => 1200 * Math.log2(a / b)

  function play(frequency, when, duration, destination) {
    if (!ready) return false

    // Pick the sample closest in pitch *measured in cents* (log scale), so
    // microtonal targets — koron/sori quarter tones — map to the right sample.
    let nearest = buffers[0]
    for (const candidate of buffers) {
      if (
        Math.abs(centsBetween(frequency, candidate.frequency)) <
        Math.abs(centsBetween(frequency, nearest.frequency))
      ) {
        nearest = candidate
      }
    }
    if (Math.abs(centsBetween(frequency, nearest.frequency)) > MAX_SHIFT_CENTS) {
      return false
    }

    const now = when ?? ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = nearest.buffer
    // Exact ratio reproduces microtonal pitches precisely (no quantization).
    src.playbackRate.value = frequency / nearest.frequency

    const gain = ctx.createGain()
    const release = Math.min(0.1, duration * 0.3)
    gain.gain.setValueAtTime(1, now)
    gain.gain.setValueAtTime(1, Math.max(now, now + duration - release))
    gain.gain.linearRampToValueAtTime(0.0001, now + duration)

    src.connect(gain).connect(destination ?? ctx.destination)
    src.start(now)
    src.stop(now + duration + 0.05)
    return true
  }

  return { load, isReady, play }
}
