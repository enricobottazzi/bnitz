import {arxivPaper} from '../reader/arxiv.mjs';

const ttl = 30 * 24 * 60 * 60;

export async function openGenerationCache(namespace, arxivId, revision, operation, input) {
  if (!namespace || typeof arxivId !== 'string' || arxivId.length > 128 || !arxivPaper(arxivId)?.version) {
    return null;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const key = `generation:${revision}:${encodeURIComponent(arxivId)}:${operation}:${hash}`;

  return {
    async get() {
      try {
        return await namespace.get(key, 'json');
      } catch {
        return null;
      }
    },
    async put(result) {
      try {
        await namespace.put(key, JSON.stringify(result), {expirationTtl: ttl});
      } catch {
        // A cache write failure does not prevent the reader from using the result.
      }
    },
  };
}
