// Helpers shared by the synth/upload player and the teacher-video player for
// turning a transcript (notes) into playable "steps" and mapping playback time
// to the active note.

import { resolveHebrewNote, OPEN_STRING_ALTS } from '../data/maqams.js'

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

/**
 * Contextually choose the open-string fingering for notes that have one (chiefly
 * Sol / G4 on the classical Azerbaijani Kamancheh, whose open G string coincides
 * with the stopped 3rd-finger Sol on the D string).
 *
 * Rather than rigidly forcing every Sol to the 3rd finger on D4, this picks the
 * open G4 string when it is the more idiomatic choice:
 *   • the note opens a phrase (a tetrachord boundary) — the upper tetrachord
 *     Sol–La–Si–Do naturally sits on the G string starting from the open Sol; or
 *   • the note is approached descending from the G string (e.g. La → Sol), where
 *     letting the open string ring is the traditional Mugham gesture.
 * Otherwise it keeps the stopped fingering, so an ascending run through the
 * lower tetrachord (Re–Mi–Fa–Sol) stays in one hand position.
 *
 * Returns a new steps array; steps chosen as open carry `openString: true`.
 */
export function applyOpenStringPreference(steps, phraseStarts = []) {
  const starts = new Set(phraseStarts)
  return steps.map((step, i) => {
    const alt = OPEN_STRING_ALTS[step.solfegeHe]
    if (!alt) return step
    const prev = steps[i - 1]
    const descendingFromHigherString =
      prev && prev.string === alt.string && prev.frequency > step.frequency
    const opensPhrase = i === 0 || starts.has(i)
    if (opensPhrase || descendingFromHigherString) {
      return { ...step, ...alt, openString: true }
    }
    return step
  })
}
