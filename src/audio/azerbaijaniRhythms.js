// Traditional Azerbaijani rhythmic accompaniment engine.
//
// Instead of a generic Western "click", this plays the kind of percussion
// patterns a nağara/qaval (daf) player would lay under a Mugham or a folk dance:
// lilting 6/8 figures (Yalli, Shalaho) and steady 4/4 Mugham beats. Each stroke
// is one of two synthesized voices:
//   • "dum" (D) — a deep, resonant bass stroke (centre of the drum head);
//   • "tek" (t) — a bright, dry rim stroke.
// Patterns are written as a string of subdivision slots: 'D', 't' or '-' (rest).

// One bar of strokes per pattern. `slotsPerBeat` says how many subdivision slots
// make up a single notated beat, so the scheduler can convert BPM → seconds.
export const AZERBAIJANI_RHYTHMS = [
  {
    id: 'yalli',
    nameHe: 'יאלי',
    meter: '6/8',
    description: 'ריקוד עם אזרי — מקצב 6/8 מתנדנד',
    slotsPerBeat: 3,
    // Two dotted beats: strong dum, then two light teks — the classic 6/8 lilt.
    pattern: ['D', '-', 't', 'D', 't', 't'],
  },
  {
    id: 'shalaho',
    nameHe: 'שלאחו',
    meter: '6/8',
    description: 'מקצב ריקוד 6/8 חי ומקפיץ',
    slotsPerBeat: 3,
    pattern: ['D', 't', 't', 'D', '-', 't'],
  },
  {
    id: 'mugham4',
    nameHe: 'מקצב מוגאם',
    meter: '4/4',
    description: 'פעימת ליווי יציבה 4/4 לאלתור מוגאם',
    slotsPerBeat: 2,
    // Steady walking pulse with a back-beat tek — keeps time under free Mugham.
    pattern: ['D', '-', 't', '-', 'D', 't', 't', '-'],
  },
  {
    id: 'tasnif',
    nameHe: 'טסניף',
    meter: '6/8',
    description: 'מקצב טסניף — שירה מדודה',
    slotsPerBeat: 3,
    pattern: ['D', '-', '-', 't', '-', 't'],
  },
]

export const DEFAULT_RHYTHM = 'yalli'

export function getRhythm(id) {
  return AZERBAIJANI_RHYTHMS.find((r) => r.id === id) || AZERBAIJANI_RHYTHMS[0]
}

// One short noise buffer reused for every rim stroke (cached on the context).
function noiseBuffer(ctx) {
  if (!ctx._azNoise) {
    const length = Math.floor(ctx.sampleRate * 0.2)
    const buf = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    ctx._azNoise = buf
  }
  return ctx._azNoise
}

// A deep, pitched bass stroke (nağara centre): a fast downward sine "thump".
function playDum(ctx, when, out, gain) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, when)
  osc.frequency.exponentialRampToValueAtTime(58, when + 0.16)

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.linearRampToValueAtTime(gain, when + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.28)

  osc.connect(amp).connect(out)
  osc.start(when)
  osc.stop(when + 0.3)
}

// A bright, dry rim stroke (tek): a short band-passed noise tick.
function playTek(ctx, when, out, gain) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2300
  bp.Q.value = 1.4

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.linearRampToValueAtTime(gain, when + 0.002)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.09)

  src.connect(bp).connect(amp).connect(out)
  src.start(when)
  src.stop(when + 0.12)
}

/**
 * Create a looping rhythm engine bound to an AudioContext.
 *
 * Uses a small look-ahead scheduler (the standard Web Audio pattern): a timer
 * wakes periodically and schedules any strokes that fall inside the next window,
 * so timing is sample-accurate and never drifts with the JS event loop.
 *
 * Returns { start, stop, setBpm, isPlaying }.
 */
export function createRhythmEngine(ctx) {
  const LOOKAHEAD_MS = 25
  const SCHEDULE_AHEAD = 0.12 // seconds scheduled past "now"

  let timer = null
  let playing = false
  let bpm = 90
  let rhythm = getRhythm(DEFAULT_RHYTHM)
  let out = null // master gain node
  let slotIndex = 0 // next slot to schedule
  let nextSlotTime = 0 // ctx time of that slot

  function slotDuration() {
    const beatSeconds = 60 / bpm
    return beatSeconds / rhythm.slotsPerBeat
  }

  function scheduler() {
    const dur = slotDuration()
    while (nextSlotTime < ctx.currentTime + SCHEDULE_AHEAD) {
      const slot = rhythm.pattern[slotIndex % rhythm.pattern.length]
      // Accent the downbeat (first slot of the bar) so the metre is audible.
      const onDownbeat = slotIndex % rhythm.pattern.length === 0
      if (slot === 'D') playDum(ctx, nextSlotTime, out, onDownbeat ? 0.9 : 0.7)
      else if (slot === 't') playTek(ctx, nextSlotTime, out, onDownbeat ? 0.5 : 0.34)
      slotIndex += 1
      nextSlotTime += dur
    }
  }

  function start(nextBpm, rhythmId, destination) {
    if (playing) stop()
    if (typeof nextBpm === 'number' && nextBpm > 0) bpm = nextBpm
    if (rhythmId) rhythm = getRhythm(rhythmId)

    out = ctx.createGain()
    out.gain.value = 0.5
    out.connect(destination ?? ctx.destination)

    slotIndex = 0
    nextSlotTime = ctx.currentTime + 0.06
    playing = true
    scheduler()
    timer = setInterval(scheduler, LOOKAHEAD_MS)
  }

  function stop() {
    playing = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (out) {
      try {
        out.disconnect()
      } catch {
        // already disconnected
      }
      out = null
    }
  }

  function setBpm(nextBpm) {
    if (typeof nextBpm === 'number' && nextBpm > 0) bpm = nextBpm
  }

  return {
    start,
    stop,
    setBpm,
    isPlaying: () => playing,
  }
}
