// Helpers shared by the synth/upload player and the teacher-video player for
// turning a transcript (notes) into playable "steps" and mapping playback time
// to the active note.

import { resolveHebrewNote } from '../data/maqams.js'

const NOTE_SECONDS = 0.9

/** Give each step a duration that lasts until the next note (last gets a tail). */
export function withDurations(base, fallback = NOTE_SECONDS) {
  return base.map((s, i) => {
    const next = base[i + 1]
    const duration = next ? Math.max(0.12, next.start - s.start) : fallback
    return { ...s, duration }
  })
}

/**
 * Build fingerboard steps from a transcript: notes shaped
 * { time, note (Hebrew Solfège), instruction }. Resolves each note to its
 * string + finger + frequency and sorts by time.
 */
export function stepsFromTranscript(notes) {
  const base = notes
    .map((n, i) => ({
      solfegeHe: n.note,
      instruction: n.instruction || '',
      start: typeof n.time === 'number' ? n.time : i * NOTE_SECONDS,
      ...resolveHebrewNote(n.note),
    }))
    .sort((a, b) => a.start - b.start)
  return withDurations(base)
}

/** Total song-time length of a steps array (seconds). */
export function totalDuration(steps) {
  if (!steps.length) return 0
  const last = steps[steps.length - 1]
  return last.start + last.duration
}

/** The index of the last step whose start time has been reached by `elapsed`. */
export function indexAtTime(steps, elapsed) {
  let idx = 0
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].start <= elapsed) idx = i
    else break
  }
  return idx
}

/** Phrase boundaries for skip/loop: every `n`-th note (default 4). */
export function phraseStartsEvery(steps, n = 4) {
  return steps.map((_, i) => i).filter((i) => i % n === 0)
}
