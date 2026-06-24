// Maqam (scale) definitions for the song player. Each maqam is an ascending
// one-octave sequence on the Kamancheh, with Hebrew Solfège names, frequencies
// (A4 = 440), and the string + finger used to play each note. `phraseStarts`
// marks the note indices the skip (⏪ / ⏩) buttons jump between — by tetrachord.
//
// Microtonal nomenclature (Azerbaijani Mugham school):
//   • "Koron" (קורון, ‹) — a NATURAL note lowered by a quarter tone (a
//     semi-flat), e.g. the Shur neutral 2nd "Mi koron".
//   • "Sori"  (סורי,  ›) — a SHARP note lowered by a quarter tone, which lands a
//     quarter tone ABOVE the natural (a semi-sharp). Flattening Fa♯ gives
//     "Fa Sori"; flattening Do♯ gives "Do Sori". Azerbaijani pedagogy names
//     these by their semi-sharp (Sori) context rather than calling them Koron.

// Microtonal helpers (a quarter tone = 50 cents).
const lower50 = (freq) => Math.round(freq * 2 ** (-50 / 1200) * 100) / 100

const note = (solfegeHe, solfege, english, frequency, string, finger) => ({
  solfegeHe,
  solfege,
  english,
  frequency,
  string,
  finger,
})

export const MAQAMS = {
  ajam: {
    id: 'ajam',
    nameHe: 'אג׳ם / מהור',
    notes: [
      note('רה', 'Re', 'D', 293.66, 'D4', 'Open'),
      note('מי', 'Mi', 'E', 329.63, 'D4', '1'),
      note('פה דיאז', 'Fa#', 'F#', 369.99, 'D4', '2'),
      note('סול', 'Sol', 'G', 392.0, 'D4', '3'),
      note('לה', 'La', 'A', 440.0, 'G4', '1'),
      note('סי', 'Si', 'B', 493.88, 'G4', '2'),
      note('דו', 'Do', 'C', 523.25, 'G4', '3'),
      note('רה', 'Re', 'D', 587.33, 'G4', 'Pinky'),
    ],
    phraseStarts: [0, 4],
  },
  shur: {
    id: 'shur',
    nameHe: 'שור',
    notes: [
      note('רה', 'Re', 'D', 293.66, 'D4', 'Open'),
      note('מי קורון', 'Mi-koron', 'E½♭', lower50(329.63), 'D4', '1'),
      note('פה', 'Fa', 'F', 349.23, 'D4', '2'),
      note('סול', 'Sol', 'G', 392.0, 'D4', '3'),
      note('לה', 'La', 'A', 440.0, 'G4', '1'),
      note('סי במול', 'Si♭', 'B♭', 466.16, 'G4', '2'),
      note('דו', 'Do', 'C', 523.25, 'G4', '3'),
      note('רה', 'Re', 'D', 587.33, 'G4', 'Pinky'),
    ],
    phraseStarts: [0, 4],
  },
  rast: {
    id: 'rast',
    nameHe: 'ראסט',
    notes: [
      note('רה', 'Re', 'D', 293.66, 'D4', 'Open'),
      note('מי', 'Mi', 'E', 329.63, 'D4', '1'),
      // Fa♯ lowered a quarter tone → a semi-sharp above Fa: "Fa Sori".
      note('פה סורי', 'Fa-sori', 'F›', lower50(369.99), 'D4', '2'),
      note('סול', 'Sol', 'G', 392.0, 'D4', '3'),
      note('לה', 'La', 'A', 440.0, 'G4', '1'),
      note('סי', 'Si', 'B', 493.88, 'G4', '2'),
      // Do♯ lowered a quarter tone → a semi-sharp above Do: "Do Sori".
      note('דו סורי', 'Do-sori', 'C›', lower50(554.37), 'G4', '3'),
      note('רה', 'Re', 'D', 587.33, 'G4', 'Pinky'),
    ],
    phraseStarts: [0, 4],
  },
}

export const MAQAM_OPTIONS = [
  { id: 'ajam', label: 'אג׳ם' },
  { id: 'shur', label: 'שור' },
  { id: 'rast', label: 'ראסט' },
]

export const DEFAULT_MAQAM = 'ajam'

// Maps a Hebrew Solfège note name (as produced by the translation backend) to a
// playable note: frequency plus the Kamancheh string + finger used to play it.
// Octave is not encoded in the names, so each name resolves to one canonical
// note within the teaching range. On the classical Azerbaijani tuning
// (D3–G3–D4–G4) the maqam in Re sits on the top two strings: the lower
// tetrachord Re–Mi–Fa–Sol on the open-Re D4 string, the upper tetrachord
// La–Si–Do–Re on the open-Sol G4 string.
const NOTE_LOOKUP = {
  'דו': { frequency: 523.25, english: 'C', string: 'G4', finger: '3' },
  'דו דיאז': { frequency: 554.37, english: 'C#', string: 'G4', finger: '3' },
  // Do♯ flattened a quarter tone — a semi-sharp above Do ("Do Sori").
  'דו סורי': { frequency: lower50(554.37), english: 'C›', string: 'G4', finger: '3' },
  'רה': { frequency: 293.66, english: 'D', string: 'D4', finger: 'Open' },
  'רה דיאז': { frequency: 311.13, english: 'D#', string: 'D4', finger: '1' },
  'מי': { frequency: 329.63, english: 'E', string: 'D4', finger: '1' },
  'מי קורון': { frequency: lower50(329.63), english: 'E‹', string: 'D4', finger: '1' },
  'פה': { frequency: 349.23, english: 'F', string: 'D4', finger: '2' },
  'פה דיאז': { frequency: 369.99, english: 'F#', string: 'D4', finger: '2' },
  // Fa♯ flattened a quarter tone — a semi-sharp above Fa ("Fa Sori").
  'פה סורי': { frequency: lower50(369.99), english: 'F›', string: 'D4', finger: '2' },
  // Sol is reachable two ways: stopped (3rd finger on the D string) or as the
  // OPEN G string. The default keeps the hand in position on D4; `openAlt` lets
  // the player switch to the ringing open G4 when the phrase calls for it
  // (see applyOpenStringPreference in audio/steps.js).
  'סול': {
    frequency: 392.0,
    english: 'G',
    string: 'D4',
    finger: '3',
    openAlt: { string: 'G4', finger: 'Open' },
  },
  'סול דיאז': { frequency: 415.3, english: 'G#', string: 'G4', finger: '1' },
  'לה': { frequency: 440.0, english: 'A', string: 'G4', finger: '1' },
  'סי במול': { frequency: 466.16, english: 'B♭', string: 'G4', finger: '2' },
  'סי': { frequency: 493.88, english: 'B', string: 'G4', finger: '2' },
}

// Notes that have an open-string alternative fingering, keyed by Hebrew Solfège
// name. The Azerbaijani Kamancheh is tuned D3–G3–D4–G4, so Sol (G4) and Re (D4)
// coincide with open strings and may be played open instead of stopped,
// depending on the musical phrase. Consumed by applyOpenStringPreference() to
// choose contextually.
export const OPEN_STRING_ALTS = {
  'סול': { string: 'G4', finger: 'Open', english: 'G', frequency: 392.0 },
}

/** Resolve a Hebrew Solfège name to a playable note (defaults to רה / D).
 *  Handles microtonal modifiers essential to Eastern maqams:
 *    "<note> קורון"  → koron, a quarter tone (≈50 cents) below the note
 *    "<note> סורי"   → sori,  a quarter tone (≈50 cents) above the note
 *  Explicit entries in NOTE_LOOKUP (which encode the exact maqam frequencies,
 *  e.g. the Rast semi-sharp 7th "דו סורי") take precedence over the generic rule. */
const raise50 = (freq) => Math.round(freq * 2 ** (50 / 1200) * 100) / 100

export function resolveHebrewNote(name) {
  if (!name) return NOTE_LOOKUP['רה']
  const key = name.trim().replace('#', ' דיאז').replace(/\s+/g, ' ')

  // Exact match first (covers the maqam-specific koron frequencies).
  if (NOTE_LOOKUP[key]) return NOTE_LOOKUP[key]

  // Generic microtonal fallback for any "<base> קורון" / "<base> סורי".
  let base = key
  let cents = 0
  if (/\sקורון$/.test(key)) {
    base = key.replace(/\sקורון$/, '')
    cents = -50
  } else if (/\sסורי$/.test(key)) {
    base = key.replace(/\sסורי$/, '')
    cents = 50
  }

  const root = NOTE_LOOKUP[base] || NOTE_LOOKUP['רה']
  if (cents === 0) return root
  return {
    ...root,
    frequency: cents < 0 ? lower50(root.frequency) : raise50(root.frequency),
    english: `${root.english}${cents < 0 ? '‹' : '›'}`,
  }
}
