// Maqam (scale) definitions for the song player. Each maqam is an ascending
// one-octave sequence on the Kamancheh, with Hebrew Solfège names, frequencies
// (A4 = 440), and the string + finger used to play each note. `phraseStarts`
// marks the note indices the skip (⏪ / ⏩) buttons jump between — by tetrachord.

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
      note('לה', 'La', 'A', 440.0, 'D4', 'Pinky'),
      note('סי', 'Si', 'B', 493.88, 'A4', '1'),
      note('דו', 'Do', 'C', 523.25, 'A4', '2'),
      note('רה', 'Re', 'D', 587.33, 'A4', '3'),
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
      note('לה', 'La', 'A', 440.0, 'D4', 'Pinky'),
      note('סי במול', 'Si♭', 'B♭', 466.16, 'A4', '1'),
      note('דו', 'Do', 'C', 523.25, 'A4', '2'),
      note('רה', 'Re', 'D', 587.33, 'A4', '3'),
    ],
    phraseStarts: [0, 4],
  },
  rast: {
    id: 'rast',
    nameHe: 'ראסט',
    notes: [
      note('רה', 'Re', 'D', 293.66, 'D4', 'Open'),
      note('מי', 'Mi', 'E', 329.63, 'D4', '1'),
      note('פה קורון', 'Fa-koron', 'F‹', lower50(369.99), 'D4', '2'),
      note('סול', 'Sol', 'G', 392.0, 'D4', '3'),
      note('לה', 'La', 'A', 440.0, 'D4', 'Pinky'),
      note('סי', 'Si', 'B', 493.88, 'A4', '1'),
      note('דו קורון', 'Do-koron', 'C‹', lower50(554.37), 'A4', '2'),
      note('רה', 'Re', 'D', 587.33, 'A4', '3'),
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
