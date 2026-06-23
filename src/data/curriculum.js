// The Kamancheh self-learning curriculum: four academic stages, each with the
// exact target pitches the tuner calibrates to. Frequencies use A4 = 440 Hz
// equal temperament, except the Shur "E half-flat" (koron), which sits ~50
// cents below E4 — a genuine microtonal interval the tuner handles directly.

// E4 (329.63) lowered by a quarter tone (50 cents): 329.63 * 2^(-50/1200).
const E_HALF_FLAT_4 = 320.24

export const STAGES = [
  {
    id: 'stage-1',
    number: 1,
    title: 'Open Strings Stability',
    summary: 'Bow each open string and hold a clean, steady pitch.',
    targets: [
      { id: 's1-a3', label: 'La / A', short: 'A3', frequency: 220.0 },
      { id: 's1-d4', label: 'Re / D', short: 'D4', frequency: 293.66 },
      { id: 's1-a4', label: 'La / A', short: 'A4', frequency: 440.0 },
      { id: 's1-d5', label: 'Re / D', short: 'D5', frequency: 587.33 },
    ],
  },
  {
    id: 'stage-2',
    number: 2,
    title: 'First Tetrachord on D',
    summary: 'The first four rising notes from D: D – E – F♯ – G.',
    targets: [
      { id: 's2-d4', label: 'Re / D', short: 'D4', frequency: 293.66 },
      { id: 's2-e4', label: 'Mi / E', short: 'E4', frequency: 329.63 },
      { id: 's2-fs4', label: 'Fa♯ / F♯', short: 'F♯4', frequency: 369.99 },
      { id: 's2-g4', label: 'Sol / G', short: 'G4', frequency: 392.0 },
    ],
  },
  {
    id: 'stage-3',
    number: 3,
    title: 'Mugham Shur Base',
    summary: 'The Shur tetrachord with the microtonal E half-flat (koron).',
    targets: [
      { id: 's3-d4', label: 'Re / D', short: 'D4', frequency: 293.66 },
      {
        id: 's3-ehf4',
        label: 'Mi-koron / E½♭',
        short: 'E half-flat',
        frequency: E_HALF_FLAT_4,
      },
      { id: 's3-f4', label: 'Fa / F', short: 'F4', frequency: 349.23 },
      { id: 's3-g4', label: 'Sol / G', short: 'G4', frequency: 392.0 },
    ],
  },
  {
    id: 'stage-4',
    number: 4,
    title: 'Traditional Melodies',
    summary: 'Apply your skills to the core notes of “Sarı Gelin”.',
    targets: [
      { id: 's4-d4', label: 'Re / D', short: 'D4', frequency: 293.66 },
      { id: 's4-e4', label: 'Mi / E', short: 'E4', frequency: 329.63 },
      { id: 's4-f4', label: 'Fa / F', short: 'F4', frequency: 349.23 },
      { id: 's4-g4', label: 'Sol / G', short: 'G4', frequency: 392.0 },
      { id: 's4-a4', label: 'La / A', short: 'A4', frequency: 440.0 },
    ],
  },
]
