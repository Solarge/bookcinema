export const storage = {
  set(key, value) {
    try { localStorage.setItem(key, value) } catch (_) {}
  },
  get(key) {
    try { return localStorage.getItem(key) } catch (_) { return null }
  },
  delete(key) {
    try { localStorage.removeItem(key) } catch (_) {}
  },
  list(prefix) {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(prefix))
    } catch (_) { return [] }
  },
}
