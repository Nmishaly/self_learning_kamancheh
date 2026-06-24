import { handleUpload } from '@vercel/blob/client'
import { list, del } from '@vercel/blob'

// Persistent storage for user practice recordings, backed by Vercel Blob.
//
// Large audio never flows THROUGH this serverless function (which has a small
// body limit). Instead the browser uploads the file DIRECTLY to Blob storage
// using @vercel/blob/client `upload()`, and this route only:
//   • POST — issues a short-lived, scoped upload token (handleUpload); and
//   • GET  — lists previously stored recordings so the history survives reloads
//            even on a fresh device; and
//   • DELETE — removes a stored recording by its blob URL.
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

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIX })
      const recordings = blobs.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      return res.status(200).json({ cloud: true, recordings })
    }

    if (req.method === 'POST') {
      // Token exchange for a direct browser → Blob upload. The client sends the
      // handshake body; we scope what it's allowed to store.
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => ({
          allowedContentTypes: [
            'audio/*',
            'video/*',
            'application/octet-stream',
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 30 * 1024 * 1024,
          // Carry the client's metadata (title, bpm, maqam…) through the flow.
          tokenPayload: typeof clientPayload === 'string' ? clientPayload : '',
        }),
        // Fires server-side once Blob confirms the upload (only on a public URL,
        // not on localhost). The client also records metadata itself, so this is
        // a best-effort hook we don't depend on.
        onUploadCompleted: async () => {},
      })
      return res.status(200).json(jsonResponse)
    }

    if (req.method === 'DELETE') {
      const url = req.query?.url || (req.body && req.body.url)
      if (!url) return res.status(400).json({ error: 'A blob "url" is required.' })
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
