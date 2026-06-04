import { openDB } from 'idb'

const DB_NAME = 'bookfilm-assets'
const DB_VERSION = 1
const STORE = 'blobs'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function storeAsset(key, blob) {
  try {
    const db = await getDB()
    await db.put(STORE, { blob, storedAt: Date.now() }, key)
    return URL.createObjectURL(blob)
  } catch (err) {
    console.warn('AssetStore put failed:', err)
    return null
  }
}

export async function loadAsset(key) {
  try {
    const db = await getDB()
    const item = await db.get(STORE, key)
    if (!item?.blob) return null
    return URL.createObjectURL(item.blob)
  } catch (_) {
    return null
  }
}

export async function deleteAsset(key) {
  try {
    const db = await getDB()
    await db.delete(STORE, key)
  } catch (_) {}
}

export async function clearSeriesAssets(seriesKey) {
  try {
    const db = await getDB()
    const allKeys = await db.getAllKeys(STORE)
    const seriesKeys = allKeys.filter(k => String(k).startsWith(seriesKey))
    await Promise.all(seriesKeys.map(k => db.delete(STORE, k)))
  } catch (_) {}
}

// Retrieve the stored Blob for a key (returns null if not found).
export async function getBlob(key) {
  try {
    const db = await getDB()
    const item = await db.get(STORE, key)
    return item?.blob ?? null
  } catch (_) {
    return null
  }
}

// Download a remote URL and store it as a blob
export async function fetchAndStore(key, remoteUrl) {
  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const blob = await res.blob()
    return storeAsset(key, blob)
  } catch (err) {
    console.warn('fetchAndStore failed:', err)
    return remoteUrl // fallback to remote URL
  }
}
