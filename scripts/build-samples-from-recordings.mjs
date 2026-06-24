// Build the Kamancheh instrument samples from REAL recordings.
//
// The app's sampled voice (public/samples/kamancheh/{D4,F4,G4,A4,C5,D5}.wav)
// sounds most authentic when driven by real Kamancheh notes rather than the
// synthesized fallback in generate-samples.mjs. Real source material, however,
// usually comes as musical phrases/loops in arbitrary keys — not one clean
// sustained note per pitch. This script bridges that gap:
//
//   1. Scan every source .wav for short, PITCH-STABLE sustained windows
//      (a steadily-bowed single note, vibrato allowed).
//   2. Keep the most stable distinct pitches found.
//   3. For each note the sampler needs, pick the nearest stable real note and
//      resample it to the exact target frequency (minimal retuning).
//   4. Normalize, fade the edges, and write a mono 16-bit WAV.
//
// Usage:
//   node scripts/build-samples-from-recordings.mjs [SOURCE_DIR]
//   SOURCE_DIR defaults to ./kamancheh-source (drop the source recordings there).
//
// The source recordings are NOT committed (they may be third-party material);
// only the short single-note results the app actually plays are. Re-run this
// whenever you swap in better source notes — e.g. a chromatic single-note pack.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = process.argv[2] || join(here, '..', 'kamancheh-source')
const OUT_DIR = join(here, '..', 'public', 'samples', 'kamancheh')

// The pitches the sampler anchors on (see src/audio/kamanchehSampler.js).
const TARGETS = [
  ['D4', 293.66],
  ['F4', 349.23],
  ['G4', 392.0],
  ['A4', 440.0],
  ['C5', 523.25],
  ['D5', 587.33],
]

const WIN_SEC = 0.8 // length of a single extracted note
const FADE_SEC = 0.025
const MAX_STAB_CENTS = 40 // reject windows whose pitch wanders more than this
const MIN_RMS = 0.04 // reject near-silent windows
const cents = (a, b) => 1200 * Math.log2(a / b)

/** Decode a (possibly 24-bit / multi-chunk) WAV to a mono Float32Array. */
function parseWav(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path}: not a WAV`)
  let off = 12
  let fmt = null
  let dataOff = 0
  let dataLen = 0
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4)
    const size = b.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(off + 8),
        ch: b.readUInt16LE(off + 10),
        sr: b.readUInt32LE(off + 12),
        bits: b.readUInt16LE(off + 22),
      }
    } else if (id === 'data') {
      dataOff = off + 8
      dataLen = size
    }
    off += 8 + size + (size & 1)
    if (fmt && dataOff) break
  }
  if (!fmt || !dataOff) throw new Error(`${path}: missing fmt/data`)
  const { ch, sr, bits, format } = fmt
  const bytes = bits / 8
  const frames = Math.floor(dataLen / bytes / ch)
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let acc = 0
    for (let c = 0; c < ch; c++) {
      const p = dataOff + (i * ch + c) * bytes
      let v = 0
      if (bits === 16) v = b.readInt16LE(p) / 32768
      else if (bits === 24) {
        let x = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)
        if (x & 0x800000) x -= 0x1000000
        v = x / 8388608
      } else if (bits === 32 && format === 3) v = b.readFloatLE(p)
      else if (bits === 32) v = b.readInt32LE(p) / 2147483648
      acc += v
    }
    mono[i] = acc / ch
  }
  return { sr, frames, mono }
}

/** Autocorrelation pitch (Hz) of one frame, or -1 if unvoiced. */
function detectPitch(buf, sr) {
  let energy = 0
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i]
  if (Math.sqrt(energy / buf.length) < 0.01) return -1
  const minLag = Math.floor(sr / 1000) // up to 1000 Hz
  const maxLag = Math.floor(sr / 120) // down to 120 Hz
  let best = -1
  let bestVal = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i < buf.length - lag; i++) s += buf[i] * buf[i + lag]
    if (s > bestVal) {
      bestVal = s
      best = lag
    }
  }
  if (best < 0 || bestVal / energy < 0.3) return -1
  return sr / best
}

/** Linear-interpolation resample that retunes by `ratio` (=target/source Hz). */
function retune(buf, start, len, ratio) {
  const outLen = Math.floor(len / ratio)
  const out = new Float32Array(outLen)
  for (let j = 0; j < outLen; j++) {
    const x = start + j * ratio
    const i = Math.floor(x)
    const frac = x - i
    out[j] = (buf[i] || 0) * (1 - frac) + (buf[i + 1] || 0) * frac
  }
  return out
}

function toWav(samples, sr) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }
  return buf
}

/** Collect short, pitch-stable, audible note windows from one file. */
function stableWindows(file) {
  const w = parseWav(file)
  const frame = Math.floor(w.sr * 0.046)
  const hop = Math.floor(w.sr * 0.012)
  const track = []
  for (let i = 0; i + frame <= w.frames; i += hop) {
    const slice = w.mono.subarray(i, i + frame)
    let rms = 0
    for (let k = 0; k < frame; k++) rms += slice[k] * slice[k]
    track.push({ pos: i, hz: detectPitch(slice, w.sr), rms: Math.sqrt(rms / frame) })
  }
  const winFrames = Math.round((WIN_SEC * w.sr) / hop)
  const out = []
  for (let s = 0; s + winFrames < track.length; s += Math.floor(winFrames / 3)) {
    const seg = track.slice(s, s + winFrames).filter((x) => x.hz > 0)
    if (seg.length < winFrames * 0.85) continue // must be mostly voiced
    const sorted = seg.map((x) => x.hz).sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    let varc = 0
    for (const x of seg) varc += cents(x.hz, med) ** 2
    const stab = Math.sqrt(varc / seg.length)
    const rmsAvg = seg.reduce((a, x) => a + x.rms, 0) / seg.length
    if (stab > MAX_STAB_CENTS || rmsAvg < MIN_RMS) continue
    out.push({ w, pos: track[s].pos, len: Math.floor(WIN_SEC * w.sr), med, stab })
  }
  return out
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  let files
  try {
    files = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith('.wav'))
  } catch {
    files = []
  }
  if (files.length === 0) {
    console.error(
      `No source .wav files in ${SOURCE_DIR}.\n` +
        `Drop your Kamancheh recordings there (or pass a directory as the first\n` +
        `argument), then re-run. To use the synthesized fallback instead, run\n` +
        `\`npm run samples\`.`,
    )
    process.exit(1)
  }

  // Pool every stable note from every file, then keep distinct pitches.
  const all = []
  for (const f of files) {
    try {
      all.push(...stableWindows(join(SOURCE_DIR, f)))
    } catch (e) {
      console.warn(`skipped ${f}: ${e.message}`)
    }
  }
  all.sort((a, b) => a.stab - b.stab)
  const distinct = []
  for (const c of all) {
    if (distinct.some((p) => Math.abs(cents(p.med, c.med)) < 120)) continue
    distinct.push(c)
  }
  if (distinct.length === 0) {
    console.error('No pitch-stable sustained notes found in the source files.')
    process.exit(1)
  }
  console.log(
    `Found ${distinct.length} stable source notes: ` +
      distinct.map((c) => `${c.med.toFixed(0)}Hz`).join(', '),
  )

  for (const [name, target] of TARGETS) {
    // Nearest stable real note, lightly preferring the steadiest.
    let best = null
    for (const c of distinct) {
      const score = Math.abs(cents(target, c.med)) + c.stab * 0.5
      if (!best || score < best.score) best = { score, c }
    }
    const c = best.c
    let out = retune(c.w.mono, c.pos, c.len, target / c.med)
    const fade = Math.floor(FADE_SEC * c.w.sr)
    for (let i = 0; i < fade && i < out.length; i++) {
      out[i] *= i / fade
      out[out.length - 1 - i] *= i / fade
    }
    let peak = 0
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
    const g = peak > 0 ? 0.9 / peak : 1
    for (let i = 0; i < out.length; i++) out[i] *= g
    writeFileSync(join(OUT_DIR, `${name}.wav`), toWav(out, c.w.sr))
    const shift = cents(target, c.med)
    console.log(
      `${name.padEnd(3)} <- ${c.med.toFixed(1)}Hz  ` +
        `retune ${shift >= 0 ? '+' : ''}${shift.toFixed(0)}c  ` +
        `(source stability ${c.stab.toFixed(0)}c)`,
    )
  }
  console.log('Done. Wrote real-Kamancheh samples to', OUT_DIR)
}

main()
