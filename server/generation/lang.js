const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
]

function getLanguage(code) {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}

export function buildLanguagePromptInstruction(langCode) {
  if (langCode === 'en' || !langCode) return ''
  const lang = getLanguage(langCode)
  return `\n\nIMPORTANT: Generate ALL text content (episode titles, dialogue, social hooks, CTAs, hashtags, descriptions, logline, series_hook) in ${lang.label}. Only leave JSON field names in English.`
}
