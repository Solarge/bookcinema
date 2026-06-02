import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../contexts/SettingsContext'
import { cloneVoice } from '../utils/mediaProviders/voiceProviders/elevenlabs'
import { cloneVoice as xttsClone } from '../utils/mediaProviders/voiceProviders/xtts'

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
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '8px 0' }}>
        Voice cloning available with ElevenLabs or XTTS-v2. Switch in Settings ⚙
      </div>
    )
  }

  return (
    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '2px', color: 'var(--gold)', marginBottom: '10px' }}>
        CLONE VOICE — {characterName.toUpperCase()}
      </div>

      {status === 'done' ? (
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6dc87a', marginBottom: '6px' }}>
            ✓ Voice cloned — ID: {voiceId}
          </div>
          <button onClick={() => setStatus('idle')} style={smallBtn}>Clone again</button>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginBottom: '8px' }}>
            Upload 10–60 sec of clean audio (MP3 / WAV / M4A)
          </div>
          <input type="file" accept="audio/*" onChange={e => setFile(e.target.files[0])}
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '8px', display: 'block', width: '100%' }} />
          {file && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', marginBottom: '8px' }}>
              ✓ {file.name}
            </div>
          )}
          {errorMsg && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f08080', marginBottom: '8px' }}>{errorMsg}</div>}
          <button onClick={handleClone} disabled={!file || status === 'uploading'} style={{
            background: file && status !== 'uploading' ? 'var(--gold)' : 'var(--border)',
            color: file && status !== 'uploading' ? '#080b10' : 'var(--muted)',
            border: 'none', padding: '7px 14px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase',
            cursor: file && status !== 'uploading' ? 'pointer' : 'not-allowed',
          }}>
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

const smallBtn = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
  padding: '5px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', cursor: 'pointer',
}
