// Generates bowed-string Kamancheh note samples (mono 16-bit WAV) so the
// sample-based instrument is active out of the box. These are SYNTHESIZED, not
// recorded — they give the sampler a fuller, CPU-free voice than the realtime
// synth and are trivially replaceable: drop real recordings with the same
// filenames into public/samples/kamancheh/ to override them.
//
// Run with:  node scripts/generate-samples.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const DUR = 1.5 // seconds
const PARTIALS = 12

// A spread of base notes across the teaching range; the sampler picks the
// nearest and pitch-shifts, so a handful covers every target within a few
// semitones.
const NOTES = [
  { name: 'D4', freq: 293.66 },
  { name: 'G4', freq: 392.0 },
  { name: 'A4', freq: 440.0 },
  { name: 'D5', freq: 587.33 },
]

/** Synthesize one sustained bowed-string note into a Float32Array. */
function synth(freq) {
  const n = Math.floor(SR * DUR)
  const out = new Float32Array(n)

  // Sawtooth-ish partial amplitudes (bowed strings are harmonically rich).
  const amps = []
  let norm = 0
  for (let k = 1; k <= PARTIALS; k++) {
    const a = 1 / Math.pow(k, 1.1)
    amps.push(a)
    norm += a
  }

  const atk = 0.08 * SR
  const dec = 0.12 * SR
  const rel = 0.3 * SR
  const sustain = 0.8
  const relStart = n - rel

  for (let i = 0; i < n; i++) {
    const t = i / SR

    // Vibrato eased in over the first 0.3s (a player settling the bow).
    const vibDepth = Math.min(1, t / 0.3) * 0.004 // ±0.4%
    const vib = 1 + vibDepth * Math.sin(2 * Math.PI * 5.5 * t)

    let s = 0
    for (let k = 1; k <= PARTIALS; k++) {
      s += amps[k - 1] * Math.sin(2 * Math.PI * freq * k * t * vib)
    }
    s /= norm

    // Amplitude ADSR.
    let env
    if (i < atk) env = i / atk
    else if (i < atk + dec) env = 1 - (1 - sustain) * ((i - atk) / dec)
    else if (i < relStart) env = sustain
    else env = sustain * Math.max(0, (n - i) / rel)

    // A short filtered-ish bow scratch at the very onset.
    let noise = 0
    const noiseLen = 0.03 * SR
    if (i < noiseLen) noise = (Math.random() * 2 - 1) * 0.15 * (1 - i / noiseLen)

    out[i] = (s + noise) * env
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
