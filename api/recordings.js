import { handleUpload } from '@vercel/blob/client'
import { list, del } from '@vercel/blob'

// Persistent storage for user practice recordings, backed by Vercel Blob.
//
// Large audio never flows THROUGH this serverless function (which has a small
// body limit). Instead the browser uploads the file DIRECTLY to Blob storage
// using @vercel/blob/client `upload()`, and this route only:
//   • POST — issues a short-lived upload token scoped to the caller's own
//            prefix (handleUpload); and
//   • GET  — lists the caller's stored recordings so the history survives
//            reloads; and
//   • DELETE — removes one of the caller's recordings by its blob URL.
//
// Every operation is confined to recordings/<deviceId>/… via the `x-device-id`
// header (see devicePrefix below), so one visitor can never list or delete
// another's recordings. The id lives in the browser's localStorage; clearing it
// orphans that device's cloud copies (on-device IndexedDB is unaffected) — the
// privacy isolation is the deliberate trade-off for cross-device recovery.
//
// If the Blob store isn't configured (no BLOB_READ_WRITE_TOKEN — e.g. local dev
// without `vercel env pull`), the endpoint reports that cleanly and the client
// falls back to on-device IndexedDB persistence, so refresh-persistence still
// works without any cloud setup.

export const config = { maxDuration: 30 }

const PREFIX = 'recordings/'

// Reuse the same optional shared-token gate as the annotate endpoint, so the
// public URL can't be used to spend the owner's Blob quota.
function gateRejected(req, res) {
  const requiredToken = process.env.APP_ACCESS_TOKEN
  if (requiredToken && req.headers['x-app-token'] !== requiredToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return true
  }
  return false
}

// Per-device isolation. Every recording is stored under recordings/<deviceId>/…
// where <deviceId> is a long random id the browser generates once and keeps in
// localStorage (see audio/recordingsStore.js). Listing and deletion are scoped
// to the caller's own prefix, so one visitor can never enumerate or delete
// another's recordings. The id is an unguessable bearer capability — not a
// user account, but enough to stop the public URL from being a shared dumping
// ground. Returns the caller's storage prefix, or null if no valid id was sent.
function devicePrefix(req) {
  const raw = req.headers['x-device-id']
  const id = typeof raw === 'string' ? raw.replace(/[^a-zA-Z0-9_-]/g, '') : ''
  // Require enough entropy that the prefix can't be guessed or brute-forced.
  if (id.length < 16) return null
  return `${PREFIX}${id}/`
}

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

export default async function handler(req, res) {
  if (gateRejected(req, res)) return

  if (!blobConfigured()) {
    return res.status(501).json({
      error: 'Cloud storage is not configured.',
      cloud: false,
    })
  }

  const prefix = devicePrefix(req)

  try {
    if (req.method === 'GET') {
      // Without a valid device id there's nothing this caller is allowed to see.
      if (!prefix) return res.status(200).json({ cloud: true, recordings: [] })
      const { blobs } = await list({ prefix })
      const recordings = blobs.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      return res.status(200).json({ cloud: true, recordings })
    }

    if (req.method === 'POST') {
      if (!prefix) {
        return res.status(401).json({ error: 'A valid device id is required.' })
      }
      // Token exchange for a direct browser → Blob upload. The client sends the
      // handshake body; we scope what it's allowed to store — and force every
      // upload under THIS device's prefix so it can't write to another's space.
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (typeof pathname !== 'string' || !pathname.startsWith(prefix)) {
            throw new Error('Upload path is not allowed for this device.')
          }
          return {
            allowedContentTypes: [
              'audio/*',
              'video/*',
              'application/octet-stream',
            ],
            addRandomSuffix: true,
            maximumSizeInBytes: 30 * 1024 * 1024,
            // Carry the client's metadata (title, bpm, maqam…) through the flow.
            tokenPayload: typeof clientPayload === 'string' ? clientPayload : '',
          }
        },
        // Fires server-side once Blob confirms the upload (only on a public URL,
        // not on localhost). The client also records metadata itself, so this is
        // a best-effort hook we don't depend on.
        onUploadCompleted: async () => {},
      })
      return res.status(200).json(jsonResponse)
    }

    if (req.method === 'DELETE') {
      if (!prefix) {
        return res.status(401).json({ error: 'A valid device id is required.' })
      }
      const url = req.query?.url || (req.body && req.body.url)
      if (!url) return res.status(400).json({ error: 'A blob "url" is required.' })
      // Only allow deleting blobs that live under the caller's own prefix.
      let path
      try {
        path = new URL(url).pathname.replace(/^\//, '')
      } catch {
        return res.status(400).json({ error: 'Invalid blob "url".' })
      }
      if (!path.startsWith(prefix)) {
        return res.status(403).json({ error: 'Not allowed to delete this recording.' })
      }
      await del(url)
      return res.status(200).json({ deleted: true })
    }

    res.setHeader('Allow', 'GET, POST, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('recordings endpoint failed:', err)
    return res.status(502).json({ error: 'Storage operation failed.' })
  }
}
