import { getPreset } from './presets.js'
import { buildLanguagePromptInstruction } from './lang.js'

function buildBASE(fixedCount) {
  // fixedCount === null → let the book decide how many episodes it needs (and how long each runs).
  const auto = !(Number.isFinite(fixedCount) && fixedCount > 0)
  const packageLabel = auto ? 'full' : `${fixedCount}-episode`
  const coverageRule = `CRITICAL: cover the ENTIRE book end to end. Every major chapter, plot arc, turning point, and the ending must be represented across the episodes — do NOT summarize, skip, compress, or stop partway through the book. Adapt the whole work, in order.`
  const episodeDirective = auto
    ? `Decide how many episodes the book actually needs to cover ALL of its content — let the source material determine it based on its length, chapters, and natural story arcs (a short story might be 2–3 episodes; a full novel many more). Do NOT force a fixed number, and never pad or truncate to hit a target. Each episode runs as long as its content genuinely needs (typically ~2–3 minutes) with as many scenes as the story requires. ${coverageRule}`
    : `Generate exactly ${fixedCount} episodes, and ensure those ${fixedCount} episodes together cover the WHOLE book (allocate the book's content evenly across them). Each episode should have 3–4 scenes. ${coverageRule}`
  return `You are a cinematic series producer and screenwriter. Your job is to transform a book into a complete ${packageLabel} AI video production package. Every response must be a valid JSON object only — no markdown, no preamble.

Analyze the book provided and return a JSON object with this exact structure:

{
  "title": "Book title",
  "author": "Author name",
  "logline": "One sentence that captures the soul of this book",
  "series_hook": "A 2-sentence emotional hook for social media",

  "characters": [
    {
      "id": "character_slug",
      "name": "Full character name",
      "role": "Protagonist / Antagonist / Supporting / Love Interest / Ally",
      "age": "Age range e.g. mid-30s",
      "description": "2-sentence physical and personality description",
      "midjourney_prompt": "Detailed image generation prompt — photorealistic, specific appearance, lighting, mood, cinematic style",
      "elevenlabs_voice": "Voice profile — tone, pace, accent, emotional quality, suggested settings"
    }
  ],

  "episodes": [
    {
      "number": 1,
      "title": "Episode title",
      "duration": "2:00–2:30 min",
      "mood": "One-line mood description",
      "characters_in_episode": ["character_slug"],
      "locations": ["Location 1", "Location 2"],
      "social_hook": "Opening hook line for social media captions",
      "scenes": [
        {
          "scene_number": 1,
          "slug": "INT./EXT. LOCATION — TIME OF DAY",
          "kling_prompt": "Detailed text-to-video prompt for a MOVING ~5s shot (NOT a static portrait or a still being panned) — explicit camera movement (push-in, dolly, tracking, pan, tilt, handheld), visible character action and movement, composition that changes across the clip, plus character reference notes, lens, color grade, duration in seconds, mood, photorealistic cinematic style",
          "stage_direction": "What happens physically in the scene",
          "dialogue": [
            {
              "character": "character_slug",
              "line": "Exact spoken dialogue line",
              "voice_direction": "Acting note — pace, emotion, delivery instruction"
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
  },

  "virality": {
    "score": 0,
    "rating": "low | medium | high",
    "probability_pct": 0,
    "reasons": ["concrete reasons this series could go viral, tied to THIS story's hooks, themes, and characters"],
    "risks": ["what could limit its reach"],
    "improvements": ["specific, actionable advice to maximize virality"],
    "strongest_hook": "the single most scroll-stopping ~3-second opening hook, as one line",
    "best_platform": "TikTok | Reels | Shorts | YouTube",
    "recommended_format": "concrete format advice, e.g. vertical 9:16, <60s, fast cuts"
  }
}

CHARACTERS: Identify the FULL cast the source material supports — typically 4–8 named characters, including the protagonist, the antagonist, and the key supporting / ally / love-interest roles that matter to the story. Never reduce the story to just 1–2 characters when the book clearly has more; flesh out the real ensemble. Actually USE this cast across the series: populate each episode's "characters_in_episode" with the characters who appear, and write dialogue for multiple characters (not a monologue) so the ensemble drives the drama.

${episodeDirective} Make the dialogue feel like a real film script — natural, emotionally intelligent, true to the book's themes, and shared across the full cast.

The kling_prompt drives a real TEXT-TO-VIDEO model (Kling, Runway Gen-3, Luma, Minimax) — it must describe a MOVING ~5-second shot, not a static portrait or a still being slowly panned. For every scene's kling_prompt, demand real motion: explicit camera movement (e.g. slow push-in, dolly, tracking, pan, tilt, handheld), visible character action and physical movement, and a composition that visibly changes over the clip. Still include lens, color grade, mood, photorealistic cinematic style, and the duration in seconds. Make video prompts highly detailed and specific enough to generate consistent, motion-rich output.

VIRALITY: After building the production package, honestly analyze THIS specific series' viral potential and fill the "virality" object. Base the score (0–100), rating, and probability_pct on this story's actual hooks, themes, and characters — do not be generically optimistic. Tie every reason, risk, and improvement to concrete details of this adaptation, give one genuinely scroll-stopping strongest_hook, and pick the best_platform and recommended_format for it.`
}

/**
 * Build the system prompt used by all text-generation adapters.
 *
 * @param {string} genrePresetKey  - Genre/style preset key (default 'cinematic')
 * @param {string} langCode        - BCP-47 language code (default 'en')
 * @param {number|string} episodeCount  - 'auto' (default) lets the book decide how many
 *   episodes it needs. A positive number forces that count (sanity-capped to 24).
 */
export function buildSystemPrompt(genrePresetKey = 'cinematic', langCode = 'en', episodeCount = 'auto') {
  // Default 'auto' → adaptive (the model picks the count from the book). A positive number
  // forces that many (capped at 24 to avoid runaway). Anything else → adaptive.
  const num = Math.round(Number(episodeCount))
  const fixedCount = Number.isFinite(num) && num > 0 ? Math.min(24, num) : null
  const preset = getPreset(genrePresetKey)
  const langInstruction = buildLanguagePromptInstruction(langCode)
  return `${buildBASE(fixedCount)}\n\nSTYLE INSTRUCTIONS:\n${preset.claudeAddition}\n${preset.systemAddition}${langInstruction}`
}
