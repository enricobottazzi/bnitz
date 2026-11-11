import {cacheKey, validateEntry} from './cache-entry.mjs';

export async function openPaperCache(paper, recipe, pageCount) {
  if (!paper.version) return null;
  const cache = await globalThis.caches?.open('bnitz-papers');
  if (!cache) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(recipe)));
  const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const key = `https://bnitz.org/papers/${cacheKey(paper, revision)}`;

  return {
    async get() {
      try {
        const response = await cache.match(key);
        if (response?.ok) return validateEntry(await response.json(), paper.source, pageCount);
      } catch {
        return null;
      }
      return null;
    },
    async put(entry) {
      validateEntry(entry, paper.source, pageCount);
      await cache.put(key, Response.json(entry));
    },
  };
}
