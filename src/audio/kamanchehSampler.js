// Sample-based Kamancheh instrument. Plays back short note samples,
// pitch-shifted to the target frequency, for a fuller and CPU-free voice; the
// realtime synth in SongInstructor remains the automatic fallback.
//
// These samples are single notes extracted from REAL Kamancheh recordings of
// the teacher (voice removed, then pitch-verified) by
// scripts/build-samples-from-recordings.mjs. The set spans the teaching range;
// the sampler pitch-shifts the nearest one for notes in between. load()
// tolerates missing files, so you can drop in more or swap the synthesized
// fallback (scripts/generate-samples.mjs) at any time.

export const SAMPLE_MANIFEST = [
  { frequency: 293.66, url: '/samples/kamancheh/D4.wav' }, // Re
  { frequency: 329.63, url: '/samples/kamancheh/E4.wav' }, // Mi
  { frequency: 369.99, url: '/samples/kamancheh/Fs4.wav' }, // Fa#
  { frequency: 392.0, url: '/samples/kamancheh/G4.wav' }, // Sol
  { frequency: 415.3, url: '/samples/kamancheh/Gs4.wav' }, // Sol#
  { frequency: 440.0, url: '/samples/kamancheh/A4.wav' }, // La
  { frequency: 466.16, url: '/samples/kamancheh/As4.wav' }, // Si♭
  { frequency: 523.25, url: '/samples/kamancheh/C5.wav' }, // Do
  { frequency: 587.33, url: '/samples/kamancheh/D5.wav' }, // Re (octave)
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
    // Per-sample resilience: one missing/undecodable file must not disable the
    // others. A file that 404s is rewritten to index.html, so decode fails and
    // that sample is simply skipped.
    await Promise.all(
      SAMPLE_MANIFEST.map(async (sample) => {
        try {
          const res = await fetch(sample.url)
          if (!res.ok) return
          const arrayBuffer = await res.arrayBuffer()
          const buffer = await ctx.decodeAudioData(arrayBuffer)
          buffers.push({ frequency: sample.frequency, buffer })
        } catch {
          // Skip this sample; the synth covers its range.
        }
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
    const playbackRate = frequency / nearest.frequency
    src.playbackRate.value = playbackRate
    // Loop the sample if the note must sustain longer than the (pitch-shifted)
    // sample lasts, so long notes don't fall to silence.
    if (duration > nearest.buffer.duration / playbackRate) src.loop = true

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
