// creditEstimate.js
//
// Lightweight, front-end-only estimates of how many managed credits an action
// will consume, so creators can see roughly what a generation will cost BEFORE
// they kick it off.
//
// IMPORTANT: these numbers mirror the server's managed credit costs but are
// ESTIMATES only. The server is the source of truth and the actual charge may
// differ (e.g. failed steps aren't billed, tier/quality can change a cost).
// Keep these roughly in sync with the server cost table if it changes.

// Per-action approximate credit costs.
export const CREDIT_COSTS = {
  image: 4,              // one character / scene image
  video: 80,             // one scene video (premium tier)
  voice: 3,              // one dialogue voice line
  sceneMusic: 10,        // one scene music bed
  mux: 5,                // combine a scene clip with its sound
  episodeSoundtrack: 10, // one episode soundtrack score
  compile: 5,            // stitch an episode's clips into a reel
}

// Estimate credits for a single episode.
// Per scene: 1 video + N dialogue voices + (music? 1 music) + 1 mux.
// Plus: (soundtrack? 1 episode soundtrack) + 1 compile.
export function estimateEpisodeCredits(episode) {
  const empty = { total: 0, videos: 0, voices: 0, music: 0, mux: 0, soundtrack: 0, compile: 0 }
  if (!episode || typeof episode !== 'object') return empty

  const scenes = Array.isArray(episode.scenes) ? episode.scenes : []

  let videos = 0
  let voices = 0
  let music = 0
  let mux = 0

  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue
    videos += 1
    voices += Array.isArray(scene.dialogue) ? scene.dialogue.length : 0
    if (scene.music_prompt) music += 1
    mux += 1
  }

  const soundtrack = episode.soundtrack ? 1 : 0
  const compile = 1

  const breakdown = {
    videos: videos * CREDIT_COSTS.video,
    voices: voices * CREDIT_COSTS.voice,
    music: music * CREDIT_COSTS.sceneMusic,
    mux: mux * CREDIT_COSTS.mux,
    soundtrack: soundtrack * CREDIT_COSTS.episodeSoundtrack,
    compile: compile * CREDIT_COSTS.compile,
  }
  const total =
    breakdown.videos + breakdown.voices + breakdown.music +
    breakdown.mux + breakdown.soundtrack + breakdown.compile

  return { total, ...breakdown }
}

// Estimate credits for the whole series ("Make My Movie").
// Images: one per character. Then every episode summed via estimateEpisodeCredits.
// Returns { total, images, videos, voices, music, mux, compile }.
export function estimateSeriesCredits(series) {
  const empty = { total: 0, images: 0, videos: 0, voices: 0, music: 0, mux: 0, compile: 0 }
  if (!series || typeof series !== 'object') return empty

  const characters = Array.isArray(series.characters) ? series.characters : []
  const episodes = Array.isArray(series.episodes) ? series.episodes : []

  const images = characters.length * CREDIT_COSTS.image

  let videos = 0
  let voices = 0
  let music = 0
  let mux = 0
  let soundtrack = 0
  let compile = 0

  for (const ep of episodes) {
    const e = estimateEpisodeCredits(ep)
    videos += e.videos
    voices += e.voices
    music += e.music
    mux += e.mux
    soundtrack += e.soundtrack
    compile += e.compile
  }

  // Episode soundtracks roll into "music" for the series-level summary.
  const musicTotal = music + soundtrack
  const total = images + videos + voices + musicTotal + mux + compile

  return { total, images, videos, voices, music: musicTotal, mux, compile }
}
