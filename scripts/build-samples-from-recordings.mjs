// Build the Kamancheh instrument samples from REAL recordings.
//
// The app's sampled voice (public/samples/kamancheh/*.wav) sounds most authentic
// when driven by real Kamancheh notes rather than the synthesized fallback in
// generate-samples.mjs. Real source material, however, usually comes as musical
// phrases/lessons — not one clean sustained note per pitch, and often with talking
// over the playing. This script turns such recordings into a clean, pitch-verified
// sample set:
//
//   1. Decode every source file (.mp3 or .wav) to mono.
//   2. Find short, PITCH-STABLE, tonally-pure sustained windows using an
//      OCTAVE-ROBUST harmonic-spectral pitch detector (plain autocorrelation
//      makes octave errors on rich bowed tones — this avoids that).
//   3. For each note the sampler needs, pick the nearest clean window, strongly
//      preferring sources with a STRONG FUNDAMENTAL so the resulting pitch is
//      unambiguous, then resample it to the exact target frequency.
//   4. Skip any note with no close source — the sampler covers it by shifting a
//      neighbour — and print the resulting SAMPLE_MANIFEST.
//
// Tip: best results come from clean, monophonic notes. If the teacher talks over
// the playing, run the files through a vocal-separation tool first (e.g. lalal.ai)
// and feed the instrument stems here.
//
// Usage:
//   node scripts/build-samples-from-recordings.mjs [SOURCE_DIR]
//   SOURCE_DIR defaults to ./kamancheh-source (drop the source recordings there).
//
// Source recordings are NOT committed (they may be third-party / personal
// material); only the short single-note results the app plays are.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = process.argv[2] || join(here, '..', 'kamancheh-source')
const OUT_DIR = join(here, '..', 'public', 'samples', 'kamancheh')

// Notes the sampler anchors on (must match src/audio/kamanchehSampler.js). The
// runtime sampler pitch-shifts the nearest one for notes in between, so a few
// well-matched anchors cover the whole microtonal range.
const TARGETS = [
  ['D4', 293.66],
  ['Ds4', 311.13],
  ['E4', 329.63],
  ['F4', 349.23],
  ['Fs4', 369.99],
  ['G4', 392.0],
  ['Gs4', 415.3],
  ['A4', 440.0],
  ['As4', 466.16],
  ['B4', 493.88],
  ['C5', 523.25],
  ['Cs5', 554.37],
  ['D5', 587.33],
]

const WIN_SEC = 0.9 // length of a single extracted note
const MAX_STAB_CENTS = 22 // reject windows whose pitch wanders more than this
const MIN_HER = 0.55 // reject speech/noise-contaminated windows (tonal purity)
const MIN_RMS = 0.02
const MAX_RETUNE_CENTS = 70 // skip a note if no source is closer than this
const cents = (a, b) => 1200 * Math.log2(a / b)

// ── decoding ───────────────────────────────────────────────────────────────

/** Decode a (possibly 24-bit / multi-chunk) WAV to { mono, sr }. */
function decodeWav(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path}: not a WAV`)
  let off = 12
  let fmt = null
  let dataOff = 0
  let dataLen = 0
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4)
    const size = b.readUInt32LE(off + 4)
    if (id === 'fmt ')
      fmt = {
        format: b.readUInt16LE(off + 8),
        ch: b.readUInt16LE(off + 10),
        sr: b.readUInt32LE(off + 12),
        bits: b.readUInt16LE(off + 22),
      }
    else if (id === 'data') {
      dataOff = off + 8
      dataLen = size
    }
    off += 8 + size + (size & 1)
    if (fmt && dataOff) break
  }
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
  return { mono, sr }
}

/** Decode an MP3 to { mono, sr } via the pure-WASM mpg123 decoder. */
async function decodeMp3(path) {
  let MPEGDecoder
  try {
    ;({ MPEGDecoder } = await import('mpg123-decoder'))
  } catch {
    throw new Error(
      'MP3 support needs the mpg123-decoder package: npm install --save-dev mpg123-decoder',
    )
  }
  const dec = new MPEGDecoder()
  await dec.ready
  const { channelData, sampleRate } = dec.decode(new Uint8Array(readFileSync(path)))
  dec.free()
  const L = channelData[0].length
  const n = channelData.length
  const mono = new Float32Array(L)
  for (let i = 0; i < L; i++) {
    let a = 0
    for (let c = 0; c < n; c++) a += channelData[c][i]
    mono[i] = a / n
  }
  return { mono, sr: sampleRate }
}

async function decode(path) {
  const ext = extname(path).toLowerCase()
  if (ext === '.mp3') return decodeMp3(path)
  if (ext === '.wav') return decodeWav(path)
  throw new Error(`${path}: unsupported type (use .mp3 or .wav)`)
}

// ── DSP helpers ──────────────────────────────────────────────────────────────

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k]
        const ai = im[i + k]
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ar + br
        im[i + k] = ai + bi
        re[i + k + len / 2] = ar - br
        im[i + k + len / 2] = ai - bi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

const NA = 4096
const winA = (() => {
  const w = new Float32Array(NA)
  for (let i = 0; i < NA; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (NA - 1)))
  return w
})()

/**
 * Octave-robust fundamental of one frame, plus tonal purity (harmonic energy
 * ratio) and fundamental strength (how dominant the fundamental bin is).
 */
function analyzeFrame(seg, sr) {
  const re = new Float32Array(NA)
  const im = new Float32Array(NA)
  for (let i = 0; i < NA; i++) re[i] = (seg[i] || 0) * winA[i]
  fft(re, im)
  const half = NA / 2
  const mag = new Float32Array(half)
  let mean = 0
  let tot = 0
  let peak = 0
  for (let k = 0; k < half; k++) {
    mag[k] = Math.hypot(re[k], im[k])
    mean += mag[k]
    tot += mag[k]
    if (mag[k] > peak) peak = mag[k]
  }
  mean /= half
  const kmin = Math.floor((220 * NA) / sr)
  const kmax = Math.ceil((820 * NA) / sr)
  let best = -1
  let bestScore = 0
  for (let k = kmin; k <= kmax; k++) {
    let s = mag[k]
    if (2 * k < half) s += 0.7 * mag[2 * k]
    if (3 * k < half) s += 0.5 * mag[3 * k]
    if (4 * k < half) s += 0.35 * mag[4 * k]
    if (s > bestScore) {
      bestScore = s
      best = k
    }
  }
  if (best < 0 || mag[best] < 6 * mean) return { hz: -1, her: 0, fund: 0 }
  const a = mag[best - 1] || 0
  const b = mag[best]
  const c = mag[best + 1] || 0
  const d = (0.5 * (a - c)) / (a - 2 * b + c || 1e-9)
  const f0 = ((best + d) * sr) / NA
  let hE = 0
  for (let k = 1; k <= 20; k++) {
    const ctr = (k * f0 * NA) / sr
    if (ctr >= half) break
    const tol = Math.max(1, 0.03 * ctr)
    for (let bb = Math.floor(ctr - tol); bb <= Math.ceil(ctr + tol); bb++)
      if (bb >= 0 && bb < half) hE += mag[bb]
  }
  return { hz: f0, her: tot > 0 ? hE / tot : 0, fund: peak > 0 ? mag[best] / peak : 0 }
}

function down2(m) {
  const o = new Float32Array(Math.floor(m.length / 2))
  for (let i = 0; i < o.length; i++) o[i] = (m[2 * i] + m[2 * i + 1]) / 2
  return o
}

/** Linear-interpolation resample that shifts pitch by `ratio` (=target/source). */
function retune(buf, ratio) {
  const outLen = Math.floor(buf.length / ratio)
  const out = new Float32Array(outLen)
  for (let j = 0; j < outLen; j++) {
    const x = j * ratio
    const i = Math.floor(x)
    const fr = x - i
    out[j] = (buf[i] || 0) * (1 - fr) + (buf[i + 1] || 0) * fr
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

// ── pipeline ─────────────────────────────────────────────────────────────────

/** Collect clean, stable, tonally-pure note windows from one decoded file. */
function stableWindows(mono, sr) {
  const a24 = down2(mono)
  const sr24 = sr / 2
  const hop = Math.floor(sr24 * 0.03)
  const track = []
  for (let i = 0; i + NA <= a24.length; i += hop) {
    const slice = a24.subarray(i, i + NA)
    let rms = 0
    for (let k = 0; k < NA; k++) rms += slice[k] * slice[k]
    rms = Math.sqrt(rms / NA)
    const fr = rms < 0.015 ? { hz: -1, her: 0, fund: 0 } : analyzeFrame(slice, sr24)
    track.push({ i, hz: fr.hz, her: fr.her, fund: fr.fund, rms })
  }
  const wlen = Math.round(WIN_SEC / 0.03)
  const out = []
  for (let s = 0; s + wlen < track.length; s += Math.floor(wlen / 3)) {
    const seg = track.slice(s, s + wlen).filter((x) => x.hz > 0)
    if (seg.length < wlen * 0.9) continue
    const sorted = seg.map((x) => x.hz).sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    let varc = 0
    for (const x of seg) varc += cents(x.hz, med) ** 2
    const stab = Math.sqrt(varc / seg.length)
    const rmsAvg = seg.reduce((a, x) => a + x.rms, 0) / seg.length
    const her = seg.reduce((a, x) => a + x.her, 0) / seg.length
    const fund = seg.reduce((a, x) => a + x.fund, 0) / seg.length
    if (stab > MAX_STAB_CENTS || rmsAvg < MIN_RMS || her < MIN_HER) continue
    out.push({ startSample: Math.round(track[s].i * 2), med, stab, her, fund })
  }
  return out
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  let files
  try {
    files = readdirSync(SOURCE_DIR).filter((f) => /\.(mp3|wav)$/i.test(f))
  } catch {
    files = []
  }
  if (files.length === 0) {
    console.error(
      `No .mp3/.wav source files in ${SOURCE_DIR}.\n` +
        `Drop your Kamancheh recordings there (or pass a directory as the first\n` +
        `argument), then re-run. For the synthesized fallback instead: npm run samples.`,
    )
    process.exit(1)
  }

  const cands = []
  for (const f of files) {
    try {
      const { mono, sr } = await decode(join(SOURCE_DIR, f))
      for (const w of stableWindows(mono, sr)) {
        cands.push({ ...w, seg: mono.slice(w.startSample, w.startSample + Math.round(WIN_SEC * sr)), sr })
      }
      process.stderr.write('.')
    } catch (e) {
      console.warn(`\nskipped ${f}: ${e.message}`)
    }
  }
  process.stderr.write('\n')
  if (cands.length === 0) {
    console.error('No clean sustained notes found in the source files.')
    process.exit(1)
  }
  console.log(`${cands.length} clean candidate notes.\n`)

  const built = []
  for (const [name, tf] of TARGETS) {
    // Nearest source (allowing octave folding for the distance), strongly
    // preferring a strong, clear fundamental and high tonal purity.
    let best = null
    for (const c of cands) {
      let bk = 0
      let bd = Infinity
      for (let k = -1; k <= 1; k++) {
        const d = Math.abs(cents(tf, c.med * 2 ** k))
        if (d < bd) {
          bd = d
          bk = k
        }
      }
      const score = bd + c.stab * 0.4 + (1 - c.her) * 15 + (1 - c.fund) * 80 + (bk !== 0 ? 40 : 0)
      if (!best || score < best.score) best = { score, c, bd }
    }
    if (!best || best.bd > MAX_RETUNE_CENTS) {
      console.log(`${name.padEnd(3)} -> skip (nearest ${best ? best.bd.toFixed(0) : '-'}c; sampler covers it)`)
      continue
    }
    const c = best.c
    // BUG-CRITICAL: shift the true source pitch to the target (tf / c.med). The
    // octave fold is already implicit in that ratio; dividing by the folded pitch
    // would leave the sample an octave off.
    let out = retune(c.seg, tf / c.med)
    const fade = Math.floor(0.03 * c.sr)
    for (let i = 0; i < fade && i < out.length; i++) {
      out[i] *= i / fade
      out[out.length - 1 - i] *= i / fade
    }
    let peak = 0
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
    const g = peak > 0 ? 0.9 / peak : 1
    for (let i = 0; i < out.length; i++) out[i] *= g
    writeFileSync(join(OUT_DIR, `${name}.wav`), toWav(out, c.sr))
    built.push({ name, tf })
    // Effective retune within the octave (the fold itself is exact, not "off").
    const fold = best.bd
    console.log(
      `${name.padEnd(3)} <- ${c.med.toFixed(1)}Hz  retune ${fold.toFixed(0)}c  purity ${(c.her * 100).toFixed(0)}%  fundamental ${(c.fund * 100).toFixed(0)}%`,
    )
  }

  console.log(`\nBuilt ${built.length} samples. SAMPLE_MANIFEST for src/audio/kamanchehSampler.js:`)
  console.log(
    '[\n' +
      built
        .map((b) => `  { frequency: ${Math.round(b.tf * 100) / 100}, url: '/samples/kamancheh/${b.name}.wav' },`)
        .join('\n') +
      '\n]',
  )
}

main()
