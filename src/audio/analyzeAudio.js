// Client-side audio analysis: onset detection (spectral flux), tempo (BPM)
// estimation, and per-onset pitch detection. Runs entirely in the browser via
// the Web Audio API, so it never touches the Vercel serverless function — there
// are no execution-time limits, no large audio uploads to a server, and no
// native ffmpeg/decoder dependencies to bundle.
//
// Input: a decoded AudioBuffer (from AudioContext.decodeAudioData) of a LOCAL or
// user-provided audio file. Output: { bpm, notes } where notes match the shape
// the player consumes ({ time, note (Hebrew Solfège), instruction }).

import { autoCorrelate, frequencyToNote } from './pitch.js'

const FRAME_SIZE = 2048
const HOP = 512

// English letter names → Hebrew fixed-do Solfège (matches resolveHebrewNote).
const EN_TO_HE = {
  C: 'דו',
  'C#': 'דו דיאז',
  D: 'רה',
  'D#': 'רה דיאז',
  E: 'מי',
  F: 'פה',
  'F#': 'פה דיאז',
  G: 'סול',
  'G#': 'סול דיאז',
  A: 'לה',
  'A#': 'סי במול',
  B: 'סי',
}

/** Average all channels down to a single mono Float32Array. */
function toMono(audioBuffer) {
  const { numberOfChannels, length } = audioBuffer
  const mono = new Float32Array(length)
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels
  }
  return mono
}

/** In-place iterative radix-2 Cooley–Tukey FFT (length must be a power of two). */
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
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k]
        const aIm = im[i + k]
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = aRe + bRe
        im[i + k] = aIm + bIm
        re[i + k + len / 2] = aRe - bRe
        im[i + k + len / 2] = aIm - bIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

function hann(size) {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return w
}

/** Spectral-flux onset envelope: positive frame-to-frame magnitude increases. */
function spectralFlux(mono) {
  const window = hann(FRAME_SIZE)
  const bins = FRAME_SIZE / 2
  let prev = new Float32Array(bins)
  const flux = []
  for (let pos = 0; pos + FRAME_SIZE <= mono.length; pos += HOP) {
    const re = new Float32Array(FRAME_SIZE)
    const im = new Float32Array(FRAME_SIZE)
    for (let i = 0; i < FRAME_SIZE; i++) re[i] = mono[pos + i] * window[i]
    fft(re, im)
    let sum = 0
    const mag = new Float32Array(bins)
    for (let k = 0; k < bins; k++) {
      mag[k] = Math.hypot(re[k], im[k])
      const diff = mag[k] - prev[k]
      if (diff > 0) sum += diff
    }
    prev = mag
    flux.push(sum)
  }
  return flux
}

/** Estimate tempo (BPM) by autocorrelating the onset envelope. */
function estimateBpm(flux, frameRate) {
  const minLag = Math.max(1, Math.round((frameRate * 60) / 200)) // up to 200 BPM
  const maxLag = Math.round((frameRate * 60) / 50) // down to 50 BPM
  let bestLag = minLag
  let best = -Infinity
  for (let lag = minLag; lag <= maxLag && lag < flux.length; lag++) {
    let acc = 0
    for (let i = 0; i + lag < flux.length; i++) acc += flux[i] * flux[i + lag]
    if (acc > best) {
      best = acc
      bestLag = lag
    }
  }
  return Math.round((60 * frameRate) / bestLag)
}

/** Adaptive peak-picking over the onset envelope → onset times (seconds). */
function pickOnsets(flux, frameRate) {
  const max = Math.max(...flux) || 1
  const norm = flux.map((v) => v / max)
  const avgWin = Math.round(0.15 * frameRate)
  const minGap = Math.max(1, Math.round(0.12 * frameRate))
  const onsets = []
  let last = -minGap
  for (let i = 1; i < norm.length - 1; i++) {
    let sum = 0
    let count = 0
    for (let j = i - avgWin; j <= i + avgWin; j++) {
      if (j >= 0 && j < norm.length) {
        sum += norm[j]
        count++
      }
    }
    const threshold = (sum / count) * 1.3 + 0.05
    const isPeak = norm[i] > threshold && norm[i] >= norm[i - 1] && norm[i] > norm[i + 1]
    if (isPeak && i - last >= minGap) {
      onsets.push(i / frameRate)
      last = i
    }
  }
  return onsets
}

/**
 * Analyze a decoded AudioBuffer into a tempo and a note list.
 * Returns { bpm, notes: [{ time, note, instruction }] }.
 */
export function analyzeAudio(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  const mono = toMono(audioBuffer)
  const frameRate = sampleRate / HOP

  const flux = spectralFlux(mono)
  const bpm = estimateBpm(flux, frameRate)
  const onsetTimes = pickOnsets(flux, frameRate)

  const notes = []
  for (const time of onsetTimes) {
    const start = Math.floor(time * sampleRate)
    const slice = mono.slice(start, start + FRAME_SIZE)
    if (slice.length < FRAME_SIZE) break
    const frequency = autoCorrelate(slice, sampleRate)
    if (frequency <= 0) continue
    const english = frequencyToNote(frequency).english
    notes.push({
      time: Math.round(time * 1000) / 1000,
      note: EN_TO_HE[english] || 'רה',
      instruction: '',
    })
  }

  return { bpm, notes }
}

/** Decode an ArrayBuffer (e.g. from a File) and analyze it. */
export async function decodeAndAnalyze(arrayBuffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    return analyzeAudio(audioBuffer)
  } finally {
    ctx.close()
  }
}
