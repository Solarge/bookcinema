export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', elevenLabsLang: 'en', googleLang: 'en-US' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸', elevenLabsLang: 'es', googleLang: 'es-ES' },
  { code: 'fr', label: 'French',  flag: '🇫🇷', elevenLabsLang: 'fr', googleLang: 'fr-FR' },
  { code: 'de', label: 'German',  flag: '🇩🇪', elevenLabsLang: 'de', googleLang: 'de-DE' },
  { code: 'it', label: 'Italian', flag: '🇮🇹', elevenLabsLang: 'it', googleLang: 'it-IT' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', elevenLabsLang: 'pt', googleLang: 'pt-BR' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳', elevenLabsLang: 'zh', googleLang: 'zh-CN' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵', elevenLabsLang: 'ja', googleLang: 'ja-JP' },
  { code: 'ko', label: 'Korean',  flag: '🇰🇷', elevenLabsLang: 'ko', googleLang: 'ko-KR' },
  { code: 'ar', label: 'Arabic',  flag: '🇸🇦', elevenLabsLang: 'ar', googleLang: 'ar-SA' },
  { code: 'hi', label: 'Hindi',   flag: '🇮🇳', elevenLabsLang: 'hi', googleLang: 'hi-IN' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺', elevenLabsLang: 'ru', googleLang: 'ru-RU' },
  { code: 'nl', label: 'Dutch',   flag: '🇳🇱', elevenLabsLang: 'nl', googleLang: 'nl-NL' },
  { code: 'sv', label: 'Swedish', flag: '🇸🇪', elevenLabsLang: 'sv', googleLang: 'sv-SE' },
  { code: 'pl', label: 'Polish',  flag: '🇵🇱', elevenLabsLang: 'pl', googleLang: 'pl-PL' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷', elevenLabsLang: 'tr', googleLang: 'tr-TR' },
]

export function getLanguage(code) {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}

export function buildLanguagePromptInstruction(langCode) {
  if (langCode === 'en' || !langCode) return ''
  const lang = getLanguage(langCode)
  return `\n\nIMPORTANT: Generate ALL text content (episode titles, dialogue, social hooks, CTAs, hashtags, descriptions, logline, series_hook) in ${lang.label}. Only leave JSON field names in English.`
}
