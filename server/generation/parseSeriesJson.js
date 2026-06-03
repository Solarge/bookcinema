// Parse a series JSON object from an LLM response, tolerating ```json code fences
// and any trailing prose after the closing fence.
export function parseSeriesJson(raw, stopReason) {
  let cleaned = String(raw || '').trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')   // strip leading fence
  cleaned = cleaned.replace(/```[\s\S]*$/, '').trim()  // strip closing fence + anything after it
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    if (stopReason === 'max_tokens') throw new Error('Response cut off — try a shorter book.')
    throw new Error(`Response parse error: ${e.message}`)
  }
}
