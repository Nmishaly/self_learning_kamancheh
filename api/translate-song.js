import Anthropic from '@anthropic-ai/sdk'

// Allow up to 60s — adaptive thinking + Opus can exceed the 10s default.
export const config = { maxDuration: 60 }

// The SDK reads ANTHROPIC_API_KEY from the environment automatically.
// Instantiated at module scope so it's reused across warm invocations.
const anthropic = new Anthropic()

// JSON schema for the structured output: an array of musical phrases. We wrap
// the array in an object because structured outputs require an object root.
const SONG_SCHEMA = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'number' }, // seconds from the start of the song
          note: { type: 'string' }, // Hebrew Solfège, e.g. "רה", "פה דיאז"
          instruction: { type: 'string' }, // Hebrew technique / ornament cue
        },
        required: ['time', 'note', 'instruction'],
        additionalProperties: false,
      },
    },
  },
  required: ['phrases'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a master teacher (מורה) of the Azerbaijani Kamancheh.
Given a song title and a maqam (mode), produce a teaching breakdown of the melody
as a timed sequence of musical phrases for a beginner student.

Rules:
- Use Hebrew fixed-do Solfège for every note name: דו, רה, מי, פה, סול, לה, סי.
  For sharps add "דיאז" (e.g. "פה דיאז") and for the Shur quarter-tone use "מי קורון".
- "instruction" must be a short Hebrew bowing/technique cue a teacher would say,
  e.g. "קשת כפולה", "לגאטו", "קשת ארוכה ויציבה", "סטקאטו".
- Where stylistically appropriate, weave in advanced ornaments (עיטורים) in the
  instruction, e.g. "טריל", "מורדנט", "גליסנדו", "תפיסה" (grace note).
- "time" is the elapsed seconds from the start of the piece (start at 0 and increase).
- Stay within the given maqam's scale.
- Return between 8 and 24 phrases.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { title, maqam } = req.body || {}
  if (!title || !maqam) {
    return res
      .status(400)
      .json({ error: 'Both "title" and "maqam" are required.' })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: SONG_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Song title: "${title}"\nMaqam: ${maqam}\n\nReturn the teaching breakdown.`,
        },
      ],
    })

    // The response conforms to SONG_SCHEMA; read the text block and parse it.
    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock) {
      return res
        .status(502)
        .json({ error: 'No text content returned by the model.' })
    }

    const parsed = JSON.parse(textBlock.text)
    return res.status(200).json({ notes: parsed.phrases })
  } catch (err) {
    console.error('translate-song failed:', err)
    const status = err?.status || 500
    return res.status(status).json({ error: err?.message || 'Translation failed.' })
  }
}
