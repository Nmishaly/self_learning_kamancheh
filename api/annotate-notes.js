import Anthropic from '@anthropic-ai/sdk'

// Allow up to 60s — adaptive thinking + Opus can exceed the 10s default.
export const config = { maxDuration: 60 }

// The SDK reads ANTHROPIC_API_KEY from the environment automatically.
// Instantiated at module scope so it's reused across warm invocations.
const anthropic = new Anthropic()

// ── Honest design ───────────────────────────────────────────────────────────
// This endpoint NO LONGER invents a melody from a title. The melody is
// transcribed from real audio in the browser (src/audio/analyzeAudio.js). Here
// we only *enrich* that real note sequence with short Hebrew bowing/technique
// cues a teacher would say — one per note. If this endpoint is unavailable the
// app still works; the notes just play without spoken-style cues.

// Hard limits to keep the endpoint cheap and abuse-resistant.
const MAX_NOTES = 64
const ALLOWED_MAQAMS = new Set(['ajam', 'shur', 'rast'])

// Best-effort, in-memory rate limit (per warm instance). Not bulletproof on
// serverless, but it throttles bursts and casual abuse of the owner's key.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
const hits = new Map() // ip -> number[] (recent request timestamps)

function rateLimited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_MAX
}

const INSTRUCTIONS_SCHEMA = {
  type: 'object',
  properties: {
    instructions: {
      type: 'array',
      items: { type: 'string' }, // one short Hebrew cue per input note
    },
  },
  required: ['instructions'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a master teacher (מורה) of the Azerbaijani Kamancheh.
You are given a melody that was ALREADY transcribed from a real recording: an
ordered list of notes (Hebrew fixed-do Solfège) with timestamps, plus the maqam.

Your only job: for EACH note, return one short Hebrew bowing/technique cue a
teacher would say while the student plays it — e.g. "קשת ארוכה", "לגאטו",
"סטקאטו", "קשת כפולה", "ויברטו עדין". Where stylistically fitting for the maqam,
suggest an ornament (עיטור): "טריל", "מורדנט", "גליסנדו", "תפיסה".

Rules:
- Return EXACTLY one instruction per input note, in the same order.
- Each instruction is 1–4 Hebrew words. No note names, no numbers, no English.
- Do not invent or reorder notes; only annotate the ones given.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Optional shared-token gate. When APP_ACCESS_TOKEN is set in the Vercel
  // project, requests must send a matching x-app-token header.
  const requiredToken = process.env.APP_ACCESS_TOKEN
  if (requiredToken && req.headers['x-app-token'] !== requiredToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Server is not configured for note annotation.' })
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }

  const { maqam, notes } = req.body || {}
  if (!ALLOWED_MAQAMS.has(maqam)) {
    return res.status(400).json({ error: 'Unknown maqam.' })
  }
  if (!Array.isArray(notes) || notes.length === 0) {
    return res.status(400).json({ error: 'A non-empty "notes" array is required.' })
  }
  if (notes.length > MAX_NOTES) {
    return res.status(400).json({ error: `Too many notes (max ${MAX_NOTES}).` })
  }

  // Only forward the minimal, sanitized fields — never echo arbitrary input
  // into the prompt (mitigates prompt-injection via crafted note strings).
  const safeNotes = notes.map((n, i) => ({
    i,
    note: String(n?.note ?? '').slice(0, 24),
  }))

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: INSTRUCTIONS_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `Maqam: ${maqam}\nNotes (in order): ${JSON.stringify(
            safeNotes.map((n) => n.note),
          )}\n\nReturn one Hebrew cue per note.`,
        },
      ],
    })

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock) {
      return res.status(502).json({ error: 'No annotation returned.' })
    }

    const parsed = JSON.parse(textBlock.text)
    const instructions = Array.isArray(parsed.instructions)
      ? parsed.instructions.slice(0, notes.length)
      : []
    return res.status(200).json({ instructions })
  } catch (err) {
    // Log server-side only; never leak internal error details to the client.
    console.error('annotate-notes failed:', err)
    return res.status(502).json({ error: 'Annotation failed.' })
  }
}
