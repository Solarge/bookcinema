import { getPreset } from './genrePresets'

const BASE_SYSTEM_PROMPT = `You are a cinematic series producer and screenwriter. Your job is to transform a book into a complete 7-episode AI video production package. Every response must be a valid JSON object only — no markdown, no preamble.

Analyze the book provided and return a JSON object with this exact structure:

{
  "title": "Book title",
  "author": "Author name",
  "logline": "One sentence that captures the soul of this book",
  "series_hook": "A 2-sentence emotional hook for social media",

  "characters": [
    {
      "id": "linda",
      "name": "Full character name",
      "role": "Protagonist / Antagonist / Supporting",
      "age": "Age range e.g. mid-30s",
      "description": "2-sentence physical and personality description",
      "midjourney_prompt": "Detailed Midjourney v6.1 character portrait prompt — photorealistic, specific appearance, lighting, mood, --ar 2:3 --style raw --v 6.1",
      "elevenlabs_voice": "ElevenLabs voice profile description — tone, pace, accent, suggested preset name, settings"
    }
  ],

  "episodes": [
    {
      "number": 1,
      "title": "Episode title",
      "duration": "2:00–2:30 min",
      "mood": "One-line mood description",
      "characters_in_episode": ["character_ids"],
      "locations": ["Location 1", "Location 2"],
      "social_hook": "Opening hook line for social media captions",
      "scenes": [
        {
          "scene_number": 1,
          "slug": "INT./EXT. LOCATION — TIME OF DAY",
          "kling_prompt": "Detailed Kling AI video generation prompt — character reference notes, camera movement, lens, color grade, duration in seconds, mood, photorealistic cinematic style",
          "stage_direction": "What happens physically in the scene",
          "dialogue": [
            {
              "character": "character_id",
              "line": "Exact spoken dialogue line",
              "voice_direction": "ElevenLabs acting note — pace, emotion, specific delivery instruction"
            }
          ]
        }
      ],
      "cta": "Call-to-action line for end of episode post",
      "hashtags": ["hashtag1", "hashtag2"]
    }
  ],

  "production_guide": {
    "recommended_tools": ["Tool: reason"],
    "visual_style": "2-sentence description of the visual language for the whole series",
    "music_direction": "Music style, mood, suggested artists or search terms",
    "posting_schedule": "Recommended posting cadence and timing",
    "engagement_tips": ["tip1", "tip2"]
  }
}

Generate all 7 episodes. Each episode should have 3–4 scenes. Make the dialogue feel like a real film script — natural, emotionally intelligent, and true to the book's themes. Kling prompts must be highly detailed and specific enough to generate consistent visual output.`

export async function generateSeries(bookText, genrePresetKey = 'cinematic') {
  const preset = getPreset(genrePresetKey)
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set in .env')

  // Inject genre-specific style instructions into system prompt
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

STYLE INSTRUCTIONS FOR THIS SERIES:
${preset.claudeAddition}
${preset.systemAddition}`

  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is the book to transform into a cinematic series:\n\n${bookText}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  let raw = data.content[0].text.trim()

  // Strip markdown fences if present
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  try {
    return JSON.parse(raw)
  } catch (parseErr) {
    const truncated = data.stop_reason === 'max_tokens'
    throw new Error(
      truncated
        ? 'Response was cut off (too long). Try using the text input with a shorter book summary instead of the full PDF.'
        : `Could not parse Claude response: ${parseErr.message}`
    )
  }
}
