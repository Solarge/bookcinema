export function generateSocialCards(episode, series) {
  const tags = (episode.hashtags || []).map(t => t.startsWith('#') ? t : `#${t}`)
  const top5 = tags.slice(0, 5).join(' ')
  const top3 = tags.slice(0, 3).join(' ')

  return {
    instagram: `${episode.social_hook}\n\n${episode.cta}\n\n${tags.join(' ')}`,
    tiktok: `${episode.social_hook} 🎬\n\n${episode.cta}\n\n${top5}`,
    twitter: `Episode ${episode.number}: "${episode.title}"\n\n${episode.social_hook}\n\n${top3}`,
    linkedin: `We're adapting "${series.title}" by ${series.author} into a 7-episode AI video series.\n\nEpisode ${episode.number}: ${episode.title}\n\n${episode.social_hook}\n\n${episode.cta}`,
    youtube: `${episode.title} | ${series.title} — Episode ${episode.number}\n\n${episode.social_hook}\n\n${episode.cta}\n\n${series.logline}\n\n${tags.join(' ')}`,
  }
}
