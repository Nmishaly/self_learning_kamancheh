// Short Azerbaijani Mugham phrases (2–4 bars) for the ear-training
// call-and-response trainer. Each note carries its Hebrew Solfège name, exact
// frequency (microtonal-aware — Shur's neutral 2nd, Rast's semi-sharps), the
// string + finger to play it, and a start time in beats. The trainer turns
// beats into seconds with the phrase tempo (BPM).

const lower50 = (freq) => Math.round(freq * 2 ** (-50 / 1200) * 100) / 100

// n(solfegeHe, frequency, string, finger, beat, beats=1)
const n = (solfegeHe, frequency, string, finger, beat, beats = 1) => ({
  solfegeHe,
  frequency,
  string,
  finger,
  beat,
  beats,
})

export const PHRASES = [
  {
    id: 'shur-bardasht',
    nameHe: 'שור · ברדאשת',
    maqam: 'shur',
    bpm: 80,
    description: 'פתיחה עולה בשור עם המי־קורון, וחזרה אל הטוניקה רה.',
    notes: [
      n('רה', 293.66, 'D4', 'Open', 0),
      n('מי קורון', lower50(329.63), 'D4', '1', 1),
      n('פה', 349.23, 'D4', '2', 2),
      n('סול', 392.0, 'D4', '3', 3),
      n('פה', 349.23, 'D4', '2', 4),
      n('מי קורון', lower50(329.63), 'D4', '1', 5),
      n('רה', 293.66, 'D4', 'Open', 6, 2),
    ],
  },
  {
    id: 'rast-maye',
    nameHe: 'ראסט · מאיה',
    maqam: 'rast',
    bpm: 88,
    description: 'משפט ראסט סביב הטוניקה עם הפה־סורי והדו־סורי.',
    notes: [
      n('רה', 293.66, 'D4', 'Open', 0),
      n('מי', 329.63, 'D4', '1', 1),
      n('פה סורי', lower50(369.99), 'D4', '2', 2),
      n('סול', 392.0, 'D4', '3', 3),
      n('לה', 440.0, 'A4', 'Open', 4, 2),
      n('סול', 392.0, 'D4', '3', 6),
      n('פה סורי', lower50(369.99), 'D4', '2', 7),
    ],
  },
  {
    id: 'ajam-dance',
    nameHe: 'אג׳ם · ריקוד',
    maqam: 'ajam',
    bpm: 104,
    description: 'משפט מקצבי וקליל באג׳ם / מהור, בקפיצות אצבעות.',
    notes: [
      n('רה', 293.66, 'D4', 'Open', 0),
      n('פה דיאז', 369.99, 'D4', '2', 1),
      n('לה', 440.0, 'A4', 'Open', 2),
      n('סול', 392.0, 'D4', '3', 3),
      n('פה דיאז', 369.99, 'D4', '2', 4),
      n('מי', 329.63, 'D4', '1', 5),
      n('רה', 293.66, 'D4', 'Open', 6, 2),
    ],
  },
]

export const DEFAULT_PHRASE = 'shur-bardasht'

/** Expand a phrase into timed notes (seconds) for the given (or native) tempo. */
export function phraseToTimedNotes(phrase, bpm = phrase.bpm) {
  const spb = 60 / (bpm > 0 ? bpm : phrase.bpm)
  return phrase.notes.map((note) => ({
    ...note,
    time: note.beat * spb,
    duration: note.beats * spb,
  }))
}

/** Total length of a phrase in seconds at the given tempo. */
export function phraseDuration(phrase, bpm = phrase.bpm) {
  const timed = phraseToTimedNotes(phrase, bpm)
  const last = timed[timed.length - 1]
  return last ? last.time + last.duration : 0
}
