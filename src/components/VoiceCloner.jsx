import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../contexts/SettingsContext'
import { cloneVoice } from '../utils/mediaProviders/voiceProviders/elevenlabs'
import { cloneVoice as xttsClone } from '../utils/mediaProviders/voiceProviders/xtts'
import '../styles/misc-components.css'

export default function VoiceCloner({ characterId, characterName, onVoiceCloned }) {
  const { settings, getApiKey, getLocalUrl } = useSettings()
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | done | error
  const [errorMsg, setErrorMsg] = useState('')
  const [voiceId, setVoiceId] = useState('')

  const isElevenLabs = settings.voiceProvider === 'elevenlabs'
  const isXTTS       = settings.voiceProvider === 'xtts'
  const supported    = isElevenLabs || isXTTS

  async function handleClone() {
    if (!file) return
    setStatus('uploading')
    setErrorMsg('')
    try {
      let id
      if (isElevenLabs) {
        const apiKey = getApiKey('elevenlabs')
        if (!apiKey) throw new Error('ElevenLabs API key not set')
        const result = await cloneVoice({ name: `${characterName} - ${characterId}`, description: `Voice for character ${characterName}`, audioFile: file, apiKey })
        id = result.voiceId
      } else if (isXTTS) {
        const baseUrl = getLocalUrl('xtts') || 'http://localhost:8020'
        const result = await xttsClone({ name: characterId, audioFile: file, baseUrl })
        id = result.voiceId
      }
      setVoiceId(id)
      setStatus('done')
      onVoiceCloned?.(id)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  if (!supported) {
    return (
      <div className="vc-unsupported">
        Voice cloning available with ElevenLabs or XTTS-v2. Switch in Settings ⚙
      </div>
    )
  }

  const canClone = file && status !== 'uploading'

  return (
    <div className="vc-wrap">
      <div className="vc-title">
        CLONE VOICE — {characterName.toUpperCase()}
      </div>

      {status === 'done' ? (
        <div>
          <div className="vc-done-msg">✓ Voice cloned — ID: {voiceId}</div>
          <button onClick={() => setStatus('idle')} className="vc-again-btn">Clone again</button>
        </div>
      ) : (
        <>
          <div className="vc-hint">
            Upload 10–60 sec of clean audio (MP3 / WAV / M4A)
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={e => setFile(e.target.files[0])}
            className="vc-file-input"
          />
          {file && <div className="vc-filename">✓ {file.name}</div>}
          {errorMsg && <div className="vc-error">{errorMsg}</div>}
          <button
            onClick={handleClone}
            disabled={!canClone}
            className="vc-clone-btn"
            style={{
              background: canClone ? 'var(--gold)' : 'var(--border)',
              color: canClone ? '#080b10' : 'var(--muted)',
              cursor: canClone ? 'pointer' : 'not-allowed',
            }}
          >
            {status === 'uploading' ? 'Cloning…' : 'Clone Voice'}
          </button>
        </>
      )}
    </div>
  )
}

VoiceCloner.propTypes = {
  characterId: PropTypes.string.isRequired,
  characterName: PropTypes.string.isRequired,
  onVoiceCloned: PropTypes.func,
}
