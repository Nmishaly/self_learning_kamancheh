// Generates bowed-string Kamancheh note samples (mono 16-bit WAV) as a
// SYNTHESIZED FALLBACK voice for the sampler. The shipped samples are built
// from REAL recordings instead (scripts/build-samples-from-recordings.mjs) and
// sound far more authentic — so prefer `npm run samples:real`. Use this script
// only when you have no source recordings; note it OVERWRITES the real samples
// in public/samples/kamancheh/ with the synthesized versions.
//
// Run with:  node scripts/generate-samples.mjs   (or: npm run samples)

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const DUR = 2.0 // seconds

// A spread of base notes across the teaching range; the sampler picks the
// nearest and pitch-shifts. Keeping the steps small (≈2–3 semitones to the
// nearest) means little pitch-shifting, so the baked-in body formants below
// barely move — far more natural than stretching one sample across an octave.
const NOTES = [
  { name: 'D4', freq: 293.66 },
  { name: 'F4', freq: 349.23 },
  { name: 'G4', freq: 392.0 },
  { name: 'A4', freq: 440.0 },
  { name: 'C5', freq: 523.25 },
  { name: 'D5', freq: 587.33 },
]

// Body/skin resonances (formants) of the small spherical Kamancheh sound box.
// Weighting the harmonics by these peaks is what gives the bowed spike-fiddle
// its warm-yet-nasal, slightly buzzy voice instead of a flat sawtooth. Each is
// { center Hz, peak gain, bandwidth Hz }; `FORMANT_FLOOR` keeps the gaps audible.
const FORMANTS = [
  { f: 380, g: 1.0, bw: 140 },
  { f: 850, g: 0.65, bw: 220 }, // nasal mid
  { f: 2600, g: 0.9, bw: 600 }, // the bright Kamancheh "shine"
  { f: 3700, g: 0.45, bw: 900 },
]
const FORMANT_FLOOR = 0.08

/** Spectral envelope at frequency f: sum of Lorentzian formant peaks. */
function formantGain(f) {
  let g = FORMANT_FLOOR
  for (const { f: fc, g: peak, bw } of FORMANTS) {
    const x = (f - fc) / (bw / 2)
    g += peak / (1 + x * x)
  }
  // Gentle air-absorption rolloff so the very top stays smooth, not fizzy.
  return g * Math.exp(-f / 9000)
}

/** RBJ band-pass biquad (0 dB peak) as a stateful sample-by-sample processor. */
function makeBandpass(f0, Q) {
  const w0 = (2 * Math.PI * f0) / SR
  const alpha = Math.sin(w0) / (2 * Q)
  const cos = Math.cos(w0)
  const a0 = 1 + alpha
  const b0 = alpha / a0
  const b2 = -alpha / a0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

/** A slow smooth random curve in [-1, 1] (summed low-freq sines, random phase). */
function driftCurve() {
  const comps = [0.7, 1.3, 2.1].map((hz) => ({ hz, ph: Math.random() * Math.PI * 2 }))
  return (t) => {
    let v = 0
    for (const c of comps) v += Math.sin(2 * Math.PI * c.hz * t + c.ph)
    return v / comps.length
  }
}

/** Synthesize one sustained, bowed Kamancheh note into a Float32Array. */
function synth(freq) {
  const n = Math.floor(SR * DUR)
  const out = new Float32Array(n)

  // Harmonics up to the Nyquist limit, weighted by a sawtooth slope AND the
  // body formants, so the timbre is shaped like a real resonating box.
  const maxK = Math.min(48, Math.floor((SR / 2 - 1) / freq))
  const amps = []
  let norm = 0
  for (let k = 1; k <= maxK; k++) {
    const a = (1 / Math.pow(k, 0.9)) * formantGain(freq * k)
    amps.push(a)
    norm += a
  }

  const atk = 0.07 * SR
  const dec = 0.14 * SR
  const rel = 0.35 * SR
  const sustain = 0.82
  const relStart = n - rel

  // Continuous bow friction: band-passed noise present for the whole note (a
  // bow never stops scraping), louder at the attack. This is the single biggest
  // cue that the sound is *bowed* rather than synthesized.
  const bowBp = makeBandpass(2400, 1.1)
  const pitchDrift = driftCurve() // slow, human intonation wander
  const pressDrift = driftCurve() // slow bow-pressure (amplitude) wander

  // Running phase accumulator so vibrato/drift bend the pitch continuously
  // without the phase discontinuities a per-sample sin(2π f t) would create.
  let phase = 0

  for (let i = 0; i < n; i++) {
    const t = i / SR

    // Wide vibrato eased in over ~0.35s, with a touch of rate wobble, plus a
    // slow intonation drift — together they kill the static "synth" feel.
    const vibDepth = Math.min(1, t / 0.35) * 0.016 // ≈ ±27 cents
    const vib = vibDepth * Math.sin(2 * Math.PI * 5.7 * t)
    const drift = 0.003 * pitchDrift(t)
    const f = freq * (1 + vib + drift)
    phase += (2 * Math.PI * f) / SR

    let s = 0
    for (let k = 1; k <= maxK; k++) s += amps[k - 1] * Math.sin(phase * k)
    s /= norm

    // Amplitude ADSR with a small attack swell (bow "bite") and a gentle
    // tremolo coupled to the vibrato, as on a real bowed string.
    let env
    if (i < atk) env = (i / atk) * 1.12 // slight overshoot at the bite
    else if (i < atk + dec) env = 1.12 - (1.12 - sustain) * ((i - atk) / dec)
    else if (i < relStart) env = sustain
    else env = sustain * Math.max(0, (n - i) / rel)
    const tremolo = 1 + 0.05 * Math.sin(2 * Math.PI * 5.7 * t) + 0.06 * pressDrift(t)
    env *= tremolo

    // Bow friction noise: continuous bed + a stronger initial scratch.
    const noiseLen = 0.05 * SR
    const onset = i < noiseLen ? 0.18 * (1 - i / noiseLen) : 0
    const bow = bowBp(Math.random() * 2 - 1) * (0.05 + onset)

    out[i] = (s + bow) * env
  }

  // Normalize peak to 0.9 to avoid clipping.
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
  const g = peak > 0 ? 0.9 / peak : 1
  for (let i = 0; i < n; i++) out[i] *= g
  return out
}

/** Encode a Float32Array as a mono 16-bit PCM WAV buffer. */
function toWav(samples, sr) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }
  return buf
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'samples', 'kamancheh')
mkdirSync(outDir, { recursive: true })

for (const { name, freq } of NOTES) {
  const wav = toWav(synth(freq), SR)
  const file = join(outDir, `${name}.wav`)
  writeFileSync(file, wav)
  console.log(`wrote ${file} (${(wav.length / 1024).toFixed(0)} KB)`)
}
console.log('Done.')
