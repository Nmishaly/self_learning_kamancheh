// The Kamancheh self-learning curriculum: four academic stages, each with the
// exact target pitches the tuner calibrates to. Frequencies use A4 = 440 Hz
// equal temperament, except the Shur "E half-flat" (koron), which sits ~50
// cents below E4 — a genuine microtonal interval the tuner handles directly.

// E4 (329.63) lowered by a quarter tone (50 cents): 329.63 * 2^(-50/1200).
const E_HALF_FLAT_4 = 320.24

// Frequencies (A4 = 440 Hz) and Solfège/English labels for the notes used by
// melodies, so a melody can be written as a simple list of note names.
const NOTE_LIBRARY = {
  D4: { label: 'Re / D', frequency: 293.66 },
  E4: { label: 'Mi / E', frequency: 329.63 },
  F4: { label: 'Fa / F', frequency: 349.23 },
  G4: { label: 'Sol / G', frequency: 392.0 },
  A4: { label: 'La / A', frequency: 440.0 },
}

// Expand a list of note names into melody entries with stable, unique ids
// (the same note can appear many times in a tune).
function buildMelody(noteNames) {
  return noteNames.map((short, index) => ({
    id: `mel-${index}-${short}`,
    short,
    label: NOTE_LIBRARY[short].label,
    frequency: NOTE_LIBRARY[short].frequency,
  }))
}

export const STAGES = [
  {
    id: 'stage-1',
    number: 1,
    title: 'יציבות במיתרים פתוחים',
    summary: 'העבירו את הקשת על כל מיתר פתוח והחזיקו צליל נקי ויציב.',
    // The classical Azerbaijani open strings, low → high: Re–Sol–Re–Sol.
    targets: [
      { id: 's1-d3', label: 'רה', short: 'רה', frequency: 146.83 },
      { id: 's1-g3', label: 'סול', short: 'סול', frequency: 196.0 },
      { id: 's1-d4', label: 'רה׳', short: 'רה׳', frequency: 293.66 },
      { id: 's1-g4', label: 'סול׳', short: 'סול׳', frequency: 392.0 },
    ],
  },
  {
    id: 'stage-2',
    number: 2,
    title: 'הטטרקורד הראשון מ־רה',
    summary: 'ארבעת הצלילים העולים הראשונים מ־רה: רה – מי – פה# – סול.',
    targets: [
      { id: 's2-d4', label: 'רה', short: 'רה', frequency: 293.66 },
      { id: 's2-e4', label: 'מי', short: 'מי', frequency: 329.63 },
      { id: 's2-fs4', label: 'פה דיאז', short: 'פה#', frequency: 369.99 },
      { id: 's2-g4', label: 'סול', short: 'סול', frequency: 392.0 },
    ],
  },
  {
    id: 'stage-3',
    number: 3,
    title: 'בסיס מוגאם שור',
    summary: 'הטטרקורד של שור עם המי במול־מיקרוטונלי (קורון).',
    targets: [
      { id: 's3-d4', label: 'רה', short: 'רה', frequency: 293.66 },
      {
        id: 's3-ehf4',
        label: 'מי קורון',
        short: 'מי קורון',
        frequency: E_HALF_FLAT_4,
      },
      { id: 's3-f4', label: 'פה', short: 'פה', frequency: 349.23 },
      { id: 's3-g4', label: 'סול', short: 'סול', frequency: 392.0 },
    ],
  },
  {
    id: 'stage-4',
    number: 4,
    title: 'מנגינות מסורתיות',
    summary: 'לימוד הסולם אג׳ם / מהור על פי שיטת המורה.',
    // A "song" stage is driven by the SongInstructor, which carries its own
    // asset (Hebrew cues, fingering and technique checks). The Sarı Gelin
    // melody below is kept for the melody-player view and future songs.
    type: 'song',
    melody: buildMelody([
      // Phrase 1 — descending opening line.
      'A4', 'A4', 'G4', 'F4', 'G4', 'A4',
      // Phrase 2 — settling toward the tonic.
      'F4', 'E4', 'D4', 'E4', 'F4', 'E4',
      // Phrase 3 — closing cadence on D.
      'D4', 'F4', 'E4', 'D4',
    ]),
  },
]
