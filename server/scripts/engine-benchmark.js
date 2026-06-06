// Engine quality gate — the harness that decides whether to promote the BookFilm
// Engine to the default media provider.
//
// Given a fixed set of sample prompts, it generates one candidate from the ENGINE
// adapter and one from a named CLOUD provider for a given media type, scores both via
// generation/scoring.js, and prints a per-prompt + overall winner table. Promote the
// engine to default (raise it in the failover chain / flip ENGINE_BEST_OF_N) only when
// it wins decisively across the prompt set.
//
// This is a SCAFFOLD: it only does real work once both the engine endpoint and the
// scoring service are configured. It guards on missing config and exits with a clear
// message otherwise.
//
// Usage (from server/):
//   ENGINE_IMAGE_URL=http://engine:8000 ENGINE_SCORE_URL=http://scorer:9000/score \
//     node scripts/engine-benchmark.js [type] [cloudProvider]
//   - type:          image | voice | video | music   (default: image)
//   - cloudProvider: registry provider name to compare against (default: per-type below)
//
// Exit code 0 = ran; 1 = not configured / unusable (so CI can gate on it).

import { config } from '../config.js'
import { MANAGED_PROVIDERS } from '../generation/registry.js'
import { scoreCandidate } from '../generation/scoring.js'

const TYPE = process.argv[2] || 'image'

// A small, fixed prompt set. Kept deliberately diverse (composition, lighting,
// character identity) so the score table reflects real-world variety.
const PROMPTS = [
  { prompt: 'A lone lighthouse on a storm-battered cliff at dusk, cinematic, volumetric light', characterRef: null },
  { prompt: 'Close-up portrait of a grizzled sea captain, weathered face, dramatic rim light', characterRef: 'captain-ref' },
  { prompt: 'A bustling neon-lit night market in the rain, reflections, shallow depth of field', characterRef: null },
  { prompt: 'Wide shot of a desert caravan crossing dunes at golden hour, epic scale', characterRef: null },
  { prompt: 'A quiet library interior with sun shafts through tall windows, dust motes', characterRef: null },
]

// Per-type default cloud comparator and the engine URL that must be set to run.
const TYPE_CONFIG = {
  image: { engineUrl: config.engine.imageUrl, defaultCloud: 'falai' },
  voice: { engineUrl: config.engine.voiceUrl, defaultCloud: 'elevenlabs' },
  video: { engineUrl: config.engine.videoUrl, defaultCloud: 'replicate' },
  music: { engineUrl: config.engine.musicUrl, defaultCloud: 'replicate' },
}

function findProvider(type, name) {
  const tier = MANAGED_PROVIDERS[type]?.standard
  if (!tier) return null
  return (tier.providers || []).find((p) => p.provider === name) || null
}

async function main() {
  const tc = TYPE_CONFIG[TYPE]
  if (!tc) {
    console.error(`[benchmark] Unsupported type '${TYPE}'. Use one of: ${Object.keys(TYPE_CONFIG).join(', ')}`)
    process.exit(1)
  }

  const cloudName = process.argv[3] || tc.defaultCloud

  // Guard: the engine endpoint for this type must be configured.
  if (!tc.engineUrl) {
    console.error(`[benchmark] Engine ${TYPE} endpoint is not configured (set ENGINE_${TYPE.toUpperCase()}_URL).`)
    console.error('[benchmark] This scaffold cannot run until the engine endpoint exists. Exiting.')
    process.exit(1)
  }
  // Guard: scoring must be configured, otherwise every candidate scores a flat 0.5
  // and the comparison is meaningless.
  if (!config.engine.scoreUrl) {
    console.error('[benchmark] Scoring service is not configured (set ENGINE_SCORE_URL).')
    console.error('[benchmark] Without a scorer every candidate scores 0.5 — comparison is meaningless. Exiting.')
    process.exit(1)
  }

  const engine = findProvider(TYPE, 'engine')
  const cloud = findProvider(TYPE, cloudName)
  if (!engine) { console.error(`[benchmark] No 'engine' provider in registry for type '${TYPE}'.`); process.exit(1) }
  if (!cloud) { console.error(`[benchmark] No '${cloudName}' provider in registry for type '${TYPE}'.`); process.exit(1) }

  console.log(`\nEngine quality gate — type=${TYPE}  engine vs ${cloudName}`)
  console.log('='.repeat(64))

  const rows = []
  let engineWins = 0
  let cloudWins = 0

  for (const { prompt, characterRef } of PROMPTS) {
    const scores = {}
    for (const [label, p] of [['engine', engine], [cloudName, cloud]]) {
      try {
        const result = await p.adapter.generate({ prompt, characterRef, model: p.model })
        scores[label] = await scoreCandidate({ type: TYPE, buffer: result?.buffer, mimeType: result?.mimeType, prompt, characterRef })
      } catch (e) {
        console.warn(`[benchmark] ${label} failed on "${prompt.slice(0, 40)}…": ${e.message}`)
        scores[label] = null
      }
    }
    const eng = scores.engine
    const cld = scores[cloudName]
    let winner = 'tie'
    if (eng != null && (cld == null || eng > cld)) { winner = 'engine'; engineWins++ }
    else if (cld != null && (eng == null || cld > eng)) { winner = cloudName; cloudWins++ }
    rows.push({ prompt: prompt.slice(0, 38) + '…', engine: eng, [cloudName]: cld, winner })
  }

  console.table(rows)
  console.log('-'.repeat(64))
  console.log(`Overall: engine ${engineWins} | ${cloudName} ${cloudWins}`)
  if (engineWins > cloudWins) console.log('VERDICT: engine wins — candidate for promotion to default.')
  else if (cloudWins > engineWins) console.log(`VERDICT: ${cloudName} still ahead — keep engine in failover, do NOT promote.`)
  else console.log('VERDICT: tie — gather more prompts before deciding.')
}

main().then(() => process.exit(0)).catch((e) => { console.error('[benchmark] fatal:', e); process.exit(1) })
