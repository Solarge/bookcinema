export const GENRE_PRESETS = {
  cinematic: {
    label: 'Cinematic Drama',
    emoji: '🎬',
    systemAddition: 'Visual style: photorealistic 35mm film look, warm colour grading, natural lighting, shallow depth of field, anamorphic lens flares.',
    claudeAddition: 'Write in a grounded, emotionally authentic dramatic style. Dialogue should feel real — no exposition dumps. Character actions speak louder than words.',
    klingStyle: 'photorealistic cinematic, 35mm film grain, anamorphic, warm tones, shallow DOF',
    fluxStyle: 'photorealistic portrait, cinematic lighting, film grain, 35mm, shallow depth of field',
  },
  noir: {
    label: 'Noir Thriller',
    emoji: '🌑',
    systemAddition: 'Visual style: high contrast black and white with selective colour, dramatic chiaroscuro shadows, rain-soaked streets, neon reflections, venetian blind light patterns.',
    claudeAddition: 'Write in a dark atmospheric noir style. Morally complex characters, sharp cynical dialogue, unreliable narrators, fate closing in.',
    klingStyle: 'noir film style, high contrast black and white, dramatic shadows, rain, neon reflections, moody',
    fluxStyle: 'noir portrait, high contrast, dramatic shadows, cinematic lighting, moody',
  },
  fantasy: {
    label: 'Epic Fantasy',
    emoji: '⚔️',
    systemAddition: 'Visual style: painterly epic fantasy aesthetic, lush magical environments, sweeping vistas, mystical lighting, practical effects look.',
    claudeAddition: 'Write in grand epic fantasy style with world-building woven into action. Heroes face impossible odds. Mythology matters. Stakes are civilisational.',
    klingStyle: 'epic fantasy cinematic, painterly, magical lighting, sweeping vistas, practical effects',
    fluxStyle: 'epic fantasy portrait, painterly, magical lighting, detailed costume, mystical atmosphere',
  },
  anime: {
    label: 'Anime',
    emoji: '✨',
    systemAddition: 'Visual style: high-quality anime art style, vibrant saturated colours, expressive character animation, dynamic action cinematography, manga panel composition.',
    claudeAddition: 'Write in anime narrative style. Emotional intensity, chosen-one themes, power of friendship, dramatic reveals, internal monologue narration.',
    klingStyle: 'anime style, high quality animation, vibrant colours, dynamic action, expressive',
    fluxStyle: 'anime character portrait, high quality, vibrant colours, detailed artwork, expressive',
  },
  documentary: {
    label: 'Documentary',
    emoji: '🎙️',
    systemAddition: 'Visual style: handheld vérité camera, natural available light, talking head interviews, archival-style b-roll, grainy authentic texture.',
    claudeAddition: 'Adapt the book as a documentary. Include narrator voice-over, interview-style character moments, factual context woven into drama. Present as if real events.',
    klingStyle: 'documentary style, handheld camera, natural lighting, vérité, authentic',
    fluxStyle: 'documentary portrait, natural lighting, authentic, candid, photojournalism style',
  },
  romance: {
    label: 'Romance Drama',
    emoji: '💛',
    systemAddition: 'Visual style: warm golden hour lighting, soft focus, intimate close-ups on faces, pastel and warm earth tones, lensflares, slow motion moments.',
    claudeAddition: 'Write with emotional depth and romantic tension. Subtext over text. The things not said matter as much as the dialogue. Chemistry through small gestures.',
    klingStyle: 'romantic cinematic, golden hour, soft focus, warm tones, intimate, slow motion',
    fluxStyle: 'romantic portrait, golden hour lighting, soft focus, warm tones, intimate',
  },
  scifi: {
    label: 'Sci-Fi',
    emoji: '🚀',
    systemAddition: 'Visual style: clean futuristic aesthetic, holographic interfaces, vast space environments, practical sci-fi design language, cool blue and white tones.',
    claudeAddition: 'Write with scientific world-building and philosophical weight. Technology shapes society and character. Questions of identity, consciousness, and humanity.',
    klingStyle: 'sci-fi cinematic, futuristic, holographic, vast environments, clean design, cool tones',
    fluxStyle: 'sci-fi portrait, futuristic costume, holographic, clean aesthetic, blue tones',
  },
  thriller: {
    label: 'Psychological Thriller',
    emoji: '🧠',
    systemAddition: 'Visual style: desaturated colour palette, tight claustrophobic framing, extreme close-ups, disorienting angles, deep shadows.',
    claudeAddition: 'Write with mounting dread and unreliable perspectives. Every scene should tighten the noose. Characters hide their true intentions. Nothing is what it seems.',
    klingStyle: 'psychological thriller, desaturated, tight framing, claustrophobic, extreme close-up',
    fluxStyle: 'thriller portrait, desaturated, intense expression, deep shadows, psychological',
  },
}

export function getPreset(key) {
  return GENRE_PRESETS[key] ?? GENRE_PRESETS.cinematic
}
