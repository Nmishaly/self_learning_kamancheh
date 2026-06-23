// Shared, framework-agnostic pitch helpers used by the tuner, melody player and
// song instructor. Keeping the maths in one place means every feature measures
// pitch and colour the same way.

// English letter names and their fixed-do Solfège equivalents, indexed by
// semitone within an octave (0 = C).
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SOLFEGE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

// The four open strings of the Azerbaijani Kamancheh, in scientific notation.
export const OPEN_STRINGS = ['A3', 'D4', 'A4', 'D5']

// A pitch is "perfectly in tune" at 0 cents and fully out of tune at this many
// cents away — used to drive the red → green tuning colour.
export const CENTS_TOLERANCE = 50

// Below this volume (root-mean-square) we treat the signal as silence.
export const SILENCE_RMS = 0.01

/** Root-mean-square amplitude of a buffer — a simple volume / envelope measure. */
export function computeRms(buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

/**
 * Estimate the fundamental frequency of a time-domain buffer using
 * autocorrelation. Returns the frequency in Hz, or -1 if no clear pitch
 * (e.g. silence or noise) is found. Lightly adapted ACF2+ algorithm.
 */
export function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length

  // 1. Bail out early if the signal is too quiet to be a real note.
  if (computeRms(buffer) < SILENCE_RMS) return -1

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
 * Map a cents deviation to a tuning colour using HSL:
 *   0 cents  -> hue 120 (vibrant green, in tune)
 *  25 cents  -> hue 60  (yellow)
 *  50+ cents -> hue 0   (red, out of tune)
 */
export function centsToColor(cents, lightness = 50) {
  const offset = Math.min(Math.abs(cents), CENTS_TOLERANCE)
  const hue = (1 - offset / CENTS_TOLERANCE) * 120
  return `hsl(${hue}, 85%, ${lightness}%)`
}

/** Cents between a detected frequency and a target frequency (microtonal-aware). */
export function centsBetween(frequency, targetFrequency) {
  return Math.round(1200 * Math.log2(frequency / targetFrequency))
}

/**
 * Convert a frequency in Hz to the nearest musical note: English letter,
 * Solfège name, octave, combined label, scientific name, cents offset and
 * whether it is a Kamancheh open string.
 */
export function frequencyToNote(frequency) {
  const noteNumber = 12 * Math.log2(frequency / 440) + 69 // A4 = 69
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
