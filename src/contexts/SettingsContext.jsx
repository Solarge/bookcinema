import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { loadSettings, saveSettings } from '../utils/settings'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => loadSettings())

  useEffect(() => {
    const { whiteLabel } = settings
    document.title = whiteLabel.enabled ? (whiteLabel.appName || 'BookFilm Studio') : 'BookFilm Studio'
    document.documentElement.style.setProperty('--gold', whiteLabel.enabled ? (whiteLabel.primaryColor || '#c8922a') : '#c8922a')
  }, [settings.whiteLabel])

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = {
        ...prev,
        ...patch,
        apiKeys:    patch.apiKeys    ? { ...prev.apiKeys,    ...patch.apiKeys    } : prev.apiKeys,
        localUrls:  patch.localUrls  ? { ...prev.localUrls,  ...patch.localUrls  } : prev.localUrls,
        whiteLabel: patch.whiteLabel ? { ...prev.whiteLabel, ...patch.whiteLabel } : prev.whiteLabel,
      }
      saveSettings(next)
      return next
    })
  }, [])

  const getApiKey   = useCallback((key) => settings.apiKeys[key]    ?? '', [settings.apiKeys])
  const getLocalUrl = useCallback((svc) => settings.localUrls[svc]  ?? '', [settings.localUrls])

  const value = useMemo(
    () => ({ settings, updateSettings, getApiKey, getLocalUrl }),
    [settings, updateSettings, getApiKey, getLocalUrl]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

SettingsProvider.propTypes = { children: PropTypes.node.isRequired }

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
