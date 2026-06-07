/**
 * processMux — muxes audio (dialogue voice line(s) + a music bed) onto an
 * otherwise-silent scene video clip using ffmpeg. Pure post-process; no AI model.
 *
 * The real ffmpeg work is performed by `muxAudioOntoVideoReal(...)` which is
 * injectable so tests never need the actual binary.
 */

import os from 'os'
import fs from 'fs'
import path from 'path'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { uploadBuffer as defaultUpload } from '../utils/s3.js'

// ── Real ffmpeg implementation ────────────────────────────────────────────────

/**
 * Download a URL to a temp file; returns the file path.
 * Caller is responsible for cleanup.
 */
async function downloadToTemp(url, index, ext = 'bin') {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${index}: HTTP ${res.status}`)
  const arrayBuf = await res.arrayBuffer()
  const tmpFile = path.join(os.tmpdir(), `mux-${process.pid}-${Date.now()}-${index}.${ext}`)
  fs.writeFileSync(tmpFile, Buffer.from(arrayBuf))
  return tmpFile
}

/**
 * Mux dialogue voice line(s) + a music bed onto a (silent) video clip.
 *
 * Filter graph (only the parts whose inputs exist are emitted):
 *  - video: the input video's video stream is mapped through unchanged.
 *  - dialogue: voiceUrls are concatenated sequentially (in order) from t=0 into
 *      one [dialogue] track:  [1:a][2:a]...concat=n=K:v=0:a=1[dialogue]
 *  - music: the music input's audio gets volume=musicVolume → [music].
 *  - mix:
 *      * both dialogue + music → amix=inputs=2:duration=first → [aout]
 *      * only dialogue         → [aout] = [dialogue]
 *      * only music            → [aout] = [music] (volume already applied)
 *  - output: -map <video>:v -map [aout], libx264/aac, -shortest + faststart.
 *      `-shortest` trims the audio to the video duration so nothing runs long.
 *
 * Input ordering: [0] = video, [1..K] = voices (in order), [K+1] = music (if present).
 *
 * @param {string}   videoUrl
 * @param {string[]} [voiceUrls]
 * @param {string|null} [musicUrl]
 * @param {number}   [musicVolume]
 * @returns {Promise<Buffer>}
 */
export async function muxAudioOntoVideoReal(videoUrl, voiceUrls = [], musicUrl = null, musicVolume = 0.3) {
  // Dynamic import so the module can load in test environments that don't have
  // the binary — tests inject their own muxFn.
  const { default: ffmpeg } = await import('fluent-ffmpeg')
  const { default: ffmpegStatic } = await import('ffmpeg-static')
  ffmpeg.setFfmpegPath(ffmpegStatic)

  const voices = Array.isArray(voiceUrls) ? voiceUrls.filter(Boolean) : []
  const tmpFiles = []
  let videoFile = null
  let musicFile = null
  const outFile = path.join(os.tmpdir(), `mux-out-${process.pid}-${Date.now()}.mp4`)

  try {
    // Download inputs in deterministic order: video, voices…, music.
    videoFile = await downloadToTemp(videoUrl, 'video', 'mp4')
    tmpFiles.push(videoFile)

    const voiceFiles = []
    for (let i = 0; i < voices.length; i++) {
      const f = await downloadToTemp(voices[i], `voice-${i}`, 'mp3')
      voiceFiles.push(f)
      tmpFiles.push(f)
    }

    if (musicUrl) {
      musicFile = await downloadToTemp(musicUrl, 'music', 'mp3')
      tmpFiles.push(musicFile)
    }

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg()

      // [0] video, [1..K] voices, [K+1] music
      cmd.input(videoFile)
      for (const f of voiceFiles) cmd.input(f)
      if (musicFile) cmd.input(musicFile)

      const voiceCount = voiceFiles.length
      const musicIndex = musicFile ? 1 + voiceCount : null

      const filterParts = []
      let dialogueLabel = null
      let musicLabel = null

      // Dialogue: concat the voice inputs sequentially into one track.
      if (voiceCount > 0) {
        const concatInputs = []
        for (let i = 0; i < voiceCount; i++) concatInputs.push(`[${1 + i}:a]`)
        filterParts.push(`${concatInputs.join('')}concat=n=${voiceCount}:v=0:a=1[dialogue]`)
        dialogueLabel = '[dialogue]'
      }

      // Music: apply the bed volume.
      if (musicFile) {
        filterParts.push(`[${musicIndex}:a]volume=${musicVolume}[music]`)
        musicLabel = '[music]'
      }

      // Mix whichever audio tracks exist into [aout].
      let audioOut
      if (dialogueLabel && musicLabel) {
        filterParts.push(`${dialogueLabel}${musicLabel}amix=inputs=2:duration=first:dropout_transition=0[aout]`)
        audioOut = '[aout]'
      } else if (dialogueLabel) {
        audioOut = dialogueLabel
      } else {
        // music-only (volume already applied)
        audioOut = musicLabel
      }

      cmd
        .complexFilter(filterParts.join(';'))
        .outputOptions([
          '-map 0:v',
          `-map ${audioOut}`,
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-movflags +faststart',
        ])
        .output(outFile)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    return fs.readFileSync(outFile)
  } finally {
    const cleanup = [...tmpFiles, outFile]
    for (const f of cleanup) {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore */ }
    }
  }
}

// ── Processor ─────────────────────────────────────────────────────────────────

/**
 * Process a 'mux' job: download video + voices + music → ffmpeg mux → S3 upload.
 *
 * @param {object} data  Bull job data { jobId, workspaceId, createdBy, payload }
 * @param {object} deps  Dependency overrides for testing
 * @param {Function} [deps.muxFn]    Inject a fake instead of real ffmpeg
 * @param {Function} [deps.uploadFn] Inject a fake instead of real S3 upload
 */
export async function processMux(data, deps = {}) {
  const mux = deps.muxFn || muxAudioOntoVideoReal
  const uploadFn = deps.uploadFn || defaultUpload

  const { jobId, workspaceId, createdBy, payload } = data
  const { videoUrl, voiceUrls = [], musicUrl = null, musicVolume = 0.3, title = null } = payload

  await Job.findByIdAndUpdate(jobId, { status: 'active' })

  try {
    const videoBuffer = await mux(videoUrl, voiceUrls, musicUrl, musicVolume)

    // Prefix the S3 key with a readable slug of the title when present (keeps ${jobId} for uniqueness).
    const slug = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
    const key = `generated/${workspaceId}/${slug ? slug + '-' : ''}${jobId}-muxed.mp4`
    const resultUrl = await uploadFn(key, videoBuffer, 'video/mp4')

    await Job.findByIdAndUpdate(jobId, { status: 'done', resultUrl, resultKey: key, errorMessage: null })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'mux_scene', provider: 'ffmpeg', success: true })

    return { ok: true, resultUrl, resultKey: key }
  } catch (err) {
    const msg = (err?.message || 'mux failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'mux_scene', provider: 'ffmpeg', success: false, errorMessage: msg })
    throw err
  }
}
