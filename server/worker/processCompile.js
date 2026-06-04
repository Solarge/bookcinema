/**
 * processCompile — stitches an episode's scene video clips into a single
 * combined video using ffmpeg (concat filter with re-encode to normalise
 * codec/resolution differences between clips).
 *
 * The real ffmpeg work is performed by `concatVideos(clipUrls)` which is
 * injectable so tests never need the actual binary.
 */

import os from 'os'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { uploadBuffer as defaultUpload } from '../utils/s3.js'

// ── Real ffmpeg implementation ────────────────────────────────────────────────

/**
 * Download a URL to a temp file; returns the file path.
 * Caller is responsible for cleanup.
 */
async function downloadToTemp(url, index) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download clip ${index}: HTTP ${res.status}`)
  const arrayBuf = await res.arrayBuffer()
  const tmpFile = path.join(os.tmpdir(), `compile-clip-${process.pid}-${Date.now()}-${index}.mp4`)
  fs.writeFileSync(tmpFile, Buffer.from(arrayBuf))
  return tmpFile
}

/**
 * Run ffmpeg concat (re-encode with libx264/aac) on an array of clip URLs.
 * Returns a Buffer of the output mp4.
 *
 * @param {string[]} clipUrls
 * @returns {Promise<Buffer>}
 */
export async function concatVideosReal(clipUrls) {
  // Dynamic import so the module can load in test environments that don't have
  // the binary — tests inject their own concatVideos.
  const { default: ffmpeg } = await import('fluent-ffmpeg')
  const { default: ffmpegStatic } = await import('ffmpeg-static')
  ffmpeg.setFfmpegPath(ffmpegStatic)

  const tmpFiles = []
  const outFile = path.join(os.tmpdir(), `compile-out-${process.pid}-${Date.now()}.mp4`)

  try {
    // Download all clips
    for (let i = 0; i < clipUrls.length; i++) {
      tmpFiles.push(await downloadToTemp(clipUrls[i], i))
    }

    // Build concat filter: scale + setsar to normalise, then concat
    await new Promise((resolve, reject) => {
      const cmd = ffmpeg()

      for (const f of tmpFiles) cmd.input(f)

      // Build filter_complex:
      // For each input: [i:v]scale=1280:720:force_original_aspect_ratio=decrease,
      //                  pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v<i>];
      //                  [i:a]aresample=44100[a<i>]
      // Then concat all [v0][a0][v1][a1]... concat=n=<N>:v=1:a=1[outv][outa]
      const n = tmpFiles.length
      const filterParts = []
      const concatInputs = []

      for (let i = 0; i < n; i++) {
        filterParts.push(
          `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
          `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`,
        )
        filterParts.push(`[${i}:a]aresample=44100[a${i}]`)
        concatInputs.push(`[v${i}][a${i}]`)
      }

      const filterComplex =
        filterParts.join(';') + ';' +
        concatInputs.join('') + `concat=n=${n}:v=1:a=1[outv][outa]`

      cmd
        .complexFilter(filterComplex)
        .outputOptions([
          '-map [outv]',
          '-map [outa]',
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
        ])
        .output(outFile)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    const buf = fs.readFileSync(outFile)
    return buf
  } finally {
    // Clean up temp files (best-effort)
    for (const f of [...tmpFiles, outFile]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore */ }
    }
  }
}

// ── Processor ─────────────────────────────────────────────────────────────────

/**
 * Process a 'compile' job: fetch scene clip URLs → ffmpeg concat → S3 upload.
 *
 * @param {object} data  Bull job data { jobId, workspaceId, createdBy, payload: { clips } }
 * @param {object} deps  Dependency overrides for testing
 * @param {Function} [deps.concatVideos]  Inject a fake instead of real ffmpeg
 * @param {Function} [deps.uploadFn]      Inject a fake instead of real S3 upload
 */
export async function processCompile(data, deps = {}) {
  const concatVideos = deps.concatVideos || concatVideosReal
  const uploadFn = deps.uploadFn || defaultUpload

  const { jobId, workspaceId, createdBy, payload } = data
  const { clips } = payload

  await Job.findByIdAndUpdate(jobId, { status: 'active' })

  try {
    const videoBuffer = await concatVideos(clips)

    const key = `generated/${workspaceId}/${jobId}-compiled.mp4`
    const resultUrl = await uploadFn(key, videoBuffer, 'video/mp4')

    await Job.findByIdAndUpdate(jobId, { status: 'done', resultUrl, errorMessage: null })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'compile_episode', provider: 'ffmpeg', success: true })

    return { ok: true, resultUrl }
  } catch (err) {
    const msg = (err?.message || 'compile failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'compile_episode', provider: 'ffmpeg', success: false, errorMessage: msg })
    throw err
  }
}
