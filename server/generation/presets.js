const PRESETS = {
  cinematic: {
    claudeAddition: 'Write in a grounded, emotionally authentic dramatic style. Dialogue should feel real — no exposition dumps. Character actions speak louder than words.',
    systemAddition: 'Visual style: photorealistic 35mm film look, warm colour grading, natural lighting, shallow depth of field, anamorphic lens flares.',
  },
  noir: {
    claudeAddition: 'Write in a dark atmospheric noir style. Morally complex characters, sharp cynical dialogue, unreliable narrators, fate closing in.',
    systemAddition: 'Visual style: high contrast black and white with selective colour, dramatic chiaroscuro shadows, rain-soaked streets, neon reflections, venetian blind light patterns.',
  },
  fantasy: {
    claudeAddition: 'Write in grand epic fantasy style with world-building woven into action. Heroes face impossible odds. Mythology matters. Stakes are civilisational.',
    systemAddition: 'Visual style: painterly epic fantasy aesthetic, lush magical environments, sweeping vistas, mystical lighting, practical effects look.',
  },
  anime: {
    claudeAddition: 'Write in anime narrative style. Emotional intensity, chosen-one themes, power of friendship, dramatic reveals, internal monologue narration.',
    systemAddition: 'Visual style: high-quality anime art style, vibrant saturated colours, expressive character animation, dynamic action cinematography, manga panel composition.',
  },
  documentary: {
    claudeAddition: 'Adapt the book as a documentary. Include narrator voice-over, interview-style character moments, factual context woven into drama. Present as if real events.',
    systemAddition: 'Visual style: handheld vérité camera, natural available light, talking head interviews, archival-style b-roll, grainy authentic texture.',
  },
  romance: {
    claudeAddition: 'Write with emotional depth and romantic tension. Subtext over text. The things not said matter as much as the dialogue. Chemistry through small gestures.',
    systemAddition: 'Visual style: warm golden hour lighting, soft focus, intimate close-ups on faces, pastel and warm earth tones, lensflares, slow motion moments.',
  },
  scifi: {
    claudeAddition: 'Write with scientific world-building and philosophical weight. Technology shapes society and character. Questions of identity, consciousness, and humanity.',
    systemAddition: 'Visual style: clean futuristic aesthetic, holographic interfaces, vast space environments, practical sci-fi design language, cool blue and white tones.',
  },
  thriller: {
    claudeAddition: 'Write with mounting dread and unreliable perspectives. Every scene should tighten the noose. Characters hide their true intentions. Nothing is what it seems.',
    systemAddition: 'Visual style: desaturated colour palette, tight claustrophobic framing, extreme close-ups, disorienting angles, deep shadows.',
  },
}

export function getPreset(key = 'cinematic') {
  return PRESETS[key] || PRESETS.cinematic
}
