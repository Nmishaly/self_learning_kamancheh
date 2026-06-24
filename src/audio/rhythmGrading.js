// Rhythmic-accuracy grading helpers, shared by the melody player and the
// call-and-response trainer. These compare WHEN a student actually played a note
// against when the song template expects it, and grade each hit Perfect / Early
// / Late — the rhythmic counterpart to the existing pitch (cents) grading.

/** Seconds per beat for a given tempo. */
export function beatSeconds(bpm) {
  return 60 / (bpm > 0 ? bpm : 90)
}

// Default timing windows (milliseconds). Anything inside ±perfect is "Perfect";
// beyond that the sign decides Early vs Late. `miss` marks a hit so far off it is
// effectively a different note (used by the matcher, not for display).
export const DEFAULT_WINDOWS = { perfect: 90, good: 220, miss: 500 }

/**
 * Grade a single hit from its signed timing error (actual − expected, ms).
 * Negative = the student played ahead of the beat (early), positive = behind.
 * Returns { grade, deltaMs } where grade ∈ 'perfect' | 'early' | 'late'.
 */
export function gradeDelta(deltaMs, windows = DEFAULT_WINDOWS) {
  if (Math.abs(deltaMs) <= windows.perfect) return { grade: 'perfect', deltaMs }
  return { grade: deltaMs < 0 ? 'early' : 'late', deltaMs }
}

const GRADE_LABEL_HE = {
  perfect: 'מדויק',
  early: 'מוקדם',
  late: 'מאוחר',
}

export function gradeLabelHe(grade) {
  return GRADE_LABEL_HE[grade] || ''
}

/**
 * Detect note onsets in a stream of pitch-detector frames. A frame is
 * { t (seconds), frequency (Hz, or <=0 for silence) }. A new onset is recorded
 * when voiced audio resumes after a short silence, or when the pitch jumps by
 * more than `jumpCents` (a clear new note while bowing legato).
 */
export function detectOnsets(frames, { gapSeconds = 0.08, jumpCents = 90 } = {}) {
  const onsets = []
  let lastVoicedT = -Infinity
  let lastFreq = 0
  let inNote = false
  for (const f of frames) {
    const voiced = f.frequency > 0
    if (!voiced) {
      if (f.t - lastVoicedT > gapSeconds) inNote = false
      continue
    }
    const jumped =
      lastFreq > 0 && Math.abs(1200 * Math.log2(f.frequency / lastFreq)) > jumpCents
    if (!inNote || jumped) {
      onsets.push({ t: f.t, frequency: f.frequency })
      inNote = true
    }
    lastVoicedT = f.t
    lastFreq = f.frequency
  }
  return onsets
}

/**
 * Match detected onsets to the expected note start times and grade each.
 * `expectedTimes` and onset `t`s are in seconds. Returns one result per
 * expected note: { index, expected, actual (or null if missed), grade,
 * deltaMs }. Greedy nearest-match within the `miss` window.
 */
export function gradePerformance(expectedTimes, onsets, windows = DEFAULT_WINDOWS) {
  const used = new Array(onsets.length).fill(false)
  return expectedTimes.map((expected, index) => {
    let bestJ = -1
    let bestAbs = Infinity
    for (let j = 0; j < onsets.length; j++) {
      if (used[j]) continue
      const abs = Math.abs(onsets[j].t - expected)
      if (abs < bestAbs) {
        bestAbs = abs
        bestJ = j
      }
    }
    if (bestJ === -1 || bestAbs * 1000 > windows.miss) {
      return { index, expected, actual: null, grade: 'miss', deltaMs: null }
    }
    used[bestJ] = true
    const deltaMs = Math.round((onsets[bestJ].t - expected) * 1000)
    return { index, expected, actual: onsets[bestJ].t, ...gradeDelta(deltaMs, windows) }
  })
}

/** Summarize graded results into a 0–100 rhythmic score and grade tallies. */
export function summarizeGrades(results) {
  const tally = { perfect: 0, early: 0, late: 0, miss: 0 }
  for (const r of results) tally[r.grade] = (tally[r.grade] || 0) + 1
  const total = results.length || 1
  // Perfect = full credit, early/late = partial, miss = none.
  const score = Math.round(
    ((tally.perfect + 0.5 * (tally.early + tally.late)) / total) * 100,
  )
  return { score, tally }
}
