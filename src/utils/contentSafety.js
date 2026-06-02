const BLOCKED_PATTERNS = [
  /child\s*(abuse|exploitation|pornograph)/i,
  /child\s*sexual/i,
  /csam/i,
  /loli(con)?/i,
  /shota(con)?/i,
  /non[\s-]?con(sensual)?\s*(sex|rape)/i,
  /snuff\s*(film|porn)/i,
  /gore\s*porn/i,
  /terrorist\s*(manifesto|bomb|attack\s*plan)/i,
  /how\s*to\s*(make|build)\s*(a\s*)?(bomb|weapon\s*of\s*mass)/i,
]

const WARNING_PATTERNS = [
  /explicit\s*sexual/i,
  /graphic\s*violence/i,
  /torture/i,
  /self[\s-]?harm/i,
  /suicide\s*method/i,
]

export function checkContentSafety(text) {
  const blocked = BLOCKED_PATTERNS.find(p => p.test(text))
  if (blocked) {
    return {
      safe: false,
      level: 'blocked',
      message: 'This content cannot be processed — it violates our content policy.',
    }
  }

  const warned = WARNING_PATTERNS.find(p => p.test(text))
  if (warned) {
    return {
      safe: true,
      level: 'warning',
      message: 'This book contains mature themes. The generated series will be adapted appropriately.',
    }
  }

  return { safe: true, level: 'clean', message: null }
}
