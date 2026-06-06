/**
 * Prompt builders for the per-section ("section-first") long-book pipeline.
 *
 * Two prompts work together for books that exceed the chunk threshold:
 *
 *   - buildBiblePrompt:   ONE call → the shared, book-wide "series bible" fields
 *                         (title, author, logline, series_hook, the FULL recurring
 *                         cast, production_guide, an overall coverage_note, and the
 *                         virality object). NO episodes. Establishes global
 *                         consistency + the canonical character list.
 *
 *   - buildSectionPrompt: ONE call PER section → episodes[] generated from that
 *                         section's ACTUAL text, using the established cast/title/
 *                         style for consistency. The episode shape is copied EXACTLY
 *                         from systemPrompt.js so every consumer (ResultsScreen,
 *                         StoryboardView, MediaContext) sees identical fields.
 *
 * The orchestrator (chunkedText.js) then merges the bible + all sections' episodes
 * into one series object matching buildSystemPrompt's schema.
 */

import { getPreset } from './presets.js'
import { buildLanguagePromptInstruction } from './lang.js'

// ── Shared episode sub-schema ────────────────────────────────────────────────
// Copied VERBATIM from systemPrompt.js so section episodes match the exact field
// names the rest of the app consumes. Keep these in sync if the schema changes.
const EPISODE_SCHEMA = `{
  "number": 1,
  "title": "Episode title",
  "duration": "3:00–5:00 min",
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
      "needs_music": false,
      "music_prompt": "Music-generation prompt for a short supportive bed under THIS scene IF it needs one — genre, instrumentation, tempo, mood aligned to the scene; empty string when needs_music is false",
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
  "hashtags": ["hashtag1", "hashtag2"],
  "soundtrack": {
    "needs_soundtrack": true,
    "music_prompt": "Cohesive episode score prompt — genre, instrumentation, tempo, mood that captures this episode's arc",
    "duration_sec": 120
  }
}`

const CHARACTER_SCHEMA = `{
  "id": "character_slug",
  "name": "Full character name",
  "role": "Protagonist / Antagonist / Supporting / Love Interest / Ally",
  "age": "Age range e.g. mid-30s",
  "description": "2-sentence physical and personality description",
  "midjourney_prompt": "Detailed image generation prompt — photorealistic, specific appearance, lighting, mood, cinematic style",
  "elevenlabs_voice": "Voice profile — tone, pace, accent, emotional quality, suggested settings"
}`

function styleBlock(genrePresetKey) {
  const preset = getPreset(genrePresetKey)
  return `STYLE INSTRUCTIONS:\n${preset.claudeAddition}\n${preset.systemAddition}`
}

/**
 * BIBLE prompt — produces ONLY the shared, book-wide fields (no episodes).
 *
 * Fed a brief whole-book overview (the joined per-chunk summaries). Returns the
 * canonical title/author/logline/series_hook, the FULL recurring cast (4–8+),
 * the production_guide, an overall coverage_note, and the virality object — so
 * every section call can stay consistent with one shared identity + cast.
 *
 * @param {string} genrePresetKey
 * @param {string} langCode
 * @returns {string} system prompt
 */
export function buildBiblePrompt(genrePresetKey = 'cinematic', langCode = 'en') {
  const langInstruction = buildLanguagePromptInstruction(langCode)
  return `You are a cinematic series producer and showrunner building the "series bible" for adapting a full book into a video series. You are given a faithful, section-by-section overview of the ENTIRE book. Your job is to define the SHARED, book-wide foundation that every episode will be built on — NOT the episodes themselves.

Every response must be a valid JSON object only — no markdown, no preamble.

Return a JSON object with EXACTLY this structure (and NOTHING else — do NOT include an "episodes" array):

{
  "title": "Book title",
  "author": "Author name",
  "logline": "One sentence that captures the soul of this book",
  "series_hook": "A 2-sentence emotional hook for social media",

  "characters": [
${CHARACTER_SCHEMA}
  ],

  "production_guide": {
    "recommended_tools": ["Tool: reason"],
    "visual_style": "2-sentence description of the visual language for the whole series",
    "music_direction": "Music style, mood, suggested artists or search terms",
    "posting_schedule": "Recommended posting cadence and timing",
    "engagement_tips": ["tip1", "tip2"]
  },

  "coverage_note": "2–3 honest sentences explaining how the book will be divided into episodes across its sections and why — tied to the book's actual structure/length.",

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

CHARACTERS: Identify the FULL recurring cast the book supports — typically 4–8 named characters (more if the book warrants), including the protagonist, the antagonist, and the key supporting / ally / love-interest roles. Give each a STABLE "id" slug; these ids are canonical and every section's episodes will reference them. Never reduce the story to just 1–2 characters when the book clearly has more.

VIRALITY: Honestly analyze THIS specific story's viral potential and fill the "virality" object. Base the score (0–100), rating, and probability_pct on this story's actual hooks, themes, and characters — do not be generically optimistic.

Do NOT generate episodes here — only the shared bible fields above.\n\n${styleBlock(genrePresetKey)}${langInstruction}`
}

/**
 * SECTION prompt — produces episodes[] for ONE section of the book from that
 * section's ACTUAL text, staying consistent with the established bible.
 *
 * The episode shape matches buildSystemPrompt's episode sub-schema EXACTLY.
 *
 * @param {string} genrePresetKey
 * @param {string} langCode
 * @returns {string} system prompt
 */
export function buildSectionPrompt(genrePresetKey = 'cinematic', langCode = 'en') {
  const langInstruction = buildLanguagePromptInstruction(langCode)
  return `You are a cinematic series producer and screenwriter adapting ONE SECTION of a book into episodes, as part of a larger series. You are given (1) the SERIES BIBLE — the shared title, established character cast, and visual style that you MUST stay consistent with — and (2) the ACTUAL TEXT of this section of the book.

Dramatize THIS section fully and completely into episodes. Cover everything that happens in this section, in order — do NOT summarize, skip, or compress. If the section warrants it, produce MULTIPLE substantial episodes (4–8 scenes each, ~3–5 min). Use the ESTABLISHED characters (by their bible "id" slugs) wherever they appear. If this section genuinely introduces a brand-new named character not in the bible, you MAY add them with a new stable "id" slug and full character fields.

Every response must be a valid JSON object only — no markdown, no preamble.

Return a JSON object with EXACTLY this structure:

{
  "episodes": [
${EPISODE_SCHEMA}
  ],
  "new_characters": [
${CHARACTER_SCHEMA}
  ]
}

- "episodes": the episodes that dramatize THIS section, fully (numbering within the section starts at 1 — the orchestrator renumbers across the whole series).
- "new_characters": ONLY characters that appear in this section but are NOT already in the bible cast. Use [] if there are none. Do NOT repeat bible characters here.

The kling_prompt drives a real TEXT-TO-VIDEO model — it must describe a MOVING ~5-second shot with explicit camera movement, visible character action and physical movement, and a composition that visibly changes over the clip; include lens, color grade, mood, photorealistic cinematic style, and duration in seconds.

MUSIC: For each scene set "needs_music" truthfully and write a concrete "music_prompt" only when true (empty string otherwise). For each episode set "soundtrack.needs_soundtrack" and write a cohesive episode score "music_prompt" with a realistic "duration_sec". Keep every music_prompt consistent with the bible's music_direction.

Make the dialogue feel like a real film script — natural, emotionally intelligent, true to the book's themes, and shared across the cast.\n\n${styleBlock(genrePresetKey)}${langInstruction}`
}
