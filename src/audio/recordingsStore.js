// Persistent store for user practice recordings.
//
// Two layers, so a refresh never loses a session and re-analysis is never
// needed:
//   1. METADATA (title, bpm, maqam, transcribed notes, timestamps, cloud URL)
//      lives in localStorage — tiny and synchronous.
//   2. The AUDIO itself lives in IndexedDB on the device (works offline, with no
//      server), and ADDITIONALLY in Vercel Blob when cloud upload is enabled
//      (so it survives a cache clear / new device). On load we prefer the cloud
//      URL when present and fall back to the on-device blob.
//
// Cloud upload is opt-in via VITE_ENABLE_BLOB so local/dev (no Blob token) stays
// fast and offline-friendly; on-device persistence always works regardless.

const META_KEY = 'kamancheh-recordings'
const DEVICE_KEY = 'kamancheh-device-id'
const DB_NAME = 'kamancheh-recordings'
const STORE = 'blobs'

const cloudEnabled = import.meta.env.VITE_ENABLE_BLOB === 'true'

// A long, random, per-device id used to scope cloud recordings to THIS browser
// (see api/recordings.js). It is an unguessable bearer capability — uploads,
// listing and deletion are confined to `recordings/<deviceId>/…`, so one
// visitor can never reach another's recordings. Generated once and persisted;
// returns null if storage is unavailable (then cloud upload is simply skipped).
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      const raw =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`
      id = raw.replace(/[^a-zA-Z0-9_-]/g, '')
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

// ── IndexedDB (on-device audio blobs) ───────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(id, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── Metadata (localStorage) ─────────────────────────────────────────────────

export function loadRecordingsMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMeta(list) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list))
  } catch {
    // Storage may be unavailable (private mode); history just won't persist.
  }
}

// ── Cloud upload (Vercel Blob, opt-in) ──────────────────────────────────────

async function uploadToCloud(id, file, meta) {
  if (!cloudEnabled) return null
  // Without a device id we can't scope the upload, so skip cloud and keep the
  // on-device copy only.
  const deviceId = getDeviceId()
  if (!deviceId) return null
  try {
    // Imported lazily so the Blob client is only pulled in when actually used.
    const { upload } = await import('@vercel/blob/client')
    const headers = { 'x-device-id': deviceId }
    if (import.meta.env.VITE_APP_ACCESS_TOKEN) {
      headers['x-app-token'] = import.meta.env.VITE_APP_ACCESS_TOKEN
    }
    const safeName = (file.name || 'recording').replace(/[^\w.\-]+/g, '_')
    const result = await upload(`recordings/${deviceId}/${id}-${safeName}`, file, {
      access: 'public',
      handleUploadUrl: '/api/recordings',
      contentType: file.type || 'application/octet-stream',
      clientPayload: JSON.stringify({ title: meta.title, bpm: meta.bpm }),
      headers,
    })
    return result.url
  } catch {
    // Cloud not configured / offline / rejected — on-device copy still persists.
    return null
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist a recording. Stores the audio on-device (IndexedDB) and, when cloud
 * upload is enabled, also to Vercel Blob. `meta` carries the transcription so
 * the session can be reopened for practice without re-analysing.
 * Returns the saved record (metadata).
 */
export async function saveRecording(file, meta) {
  const id = meta.id || `rec-${Date.now()}`
  let storedLocally = false
  try {
    await idbPut(id, file)
    storedLocally = true
  } catch {
    // No IndexedDB — we'll lean on the cloud URL if available.
  }

  const cloudUrl = await uploadToCloud(id, file, meta)

  const record = {
    id,
    title: meta.title || 'הקלטה',
    maqam: meta.maqam,
    bpm: meta.bpm,
    notes: meta.notes || [],
    mime: file.type || '',
    size: file.size || 0,
    createdAt: Date.now(),
    cloudUrl: cloudUrl || null,
    storedLocally,
  }

  const next = [record, ...loadRecordingsMeta().filter((r) => r.id !== id)]
  saveMeta(next)
  return record
}

/**
 * Resolve a playable URL for a stored record: the cloud URL if present,
 * otherwise an object URL for the on-device blob. Returns null if neither is
 * available (e.g. metadata kept but the blob was evicted). Object URLs are
 * cheap and released on page unload.
 */
export async function getRecordingUrl(record) {
  if (record.cloudUrl) return record.cloudUrl
  try {
    const blob = await idbGet(record.id)
    if (blob) return URL.createObjectURL(blob)
  } catch {
    // fall through
  }
  return null
}

export async function deleteRecording(id) {
  const record = loadRecordingsMeta().find((r) => r.id === id)
  try {
    await idbDelete(id)
  } catch {
    // ignore
  }
  // Best-effort cloud delete (only meaningful when cloud is configured).
  if (record && record.cloudUrl && cloudEnabled) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      const deviceId = getDeviceId()
      if (deviceId) headers['x-device-id'] = deviceId
      if (import.meta.env.VITE_APP_ACCESS_TOKEN) {
        headers['x-app-token'] = import.meta.env.VITE_APP_ACCESS_TOKEN
      }
      await fetch('/api/recordings', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ url: record.cloudUrl }),
      })
    } catch {
      // ignore network/permission errors
    }
  }
  saveMeta(loadRecordingsMeta().filter((r) => r.id !== id))
}

export const isCloudEnabled = cloudEnabled
