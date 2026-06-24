// Persist transcripts of local teacher videos so they're analyzed only once.
// Keyed by the video filename; stores the small { bpm, notes } result (never
// the audio itself), so it stays well within localStorage limits.

const PREFIX = 'kam-transcript:'

export function loadTranscript(file) {
  try {
    const raw = localStorage.getItem(PREFIX + file)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data && Array.isArray(data.notes) ? data : null
  } catch {
    return null
  }
}

export function saveTranscript(file, data) {
  try {
    localStorage.setItem(PREFIX + file, JSON.stringify(data))
  } catch {
    // Storage full or unavailable — the transcript just won't be cached.
  }
}
