import {cacheKey, validateEntry} from './cache-entry.mjs';

async function loadSharedConfig() {
  const response = await fetch(new URL('./cache-config.json', import.meta.url));
  return response.ok ? response.json() : null;
}

export async function openPaperCache(paper, recipe, pageCount) {
  if (!paper.version) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(recipe)));
  const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const path = `/papers/${cacheKey(paper, revision)}`;
  const localUrl = `https://bnitz.org${path}`;
  const [local, shared] = await Promise.all([
    globalThis.caches?.open('bnitz-papers').catch(() => null),
    loadSharedConfig().catch(() => null),
  ]);

  async function read(response) {
    if (!response?.ok) return null;
    return validateEntry(await response.json(), paper.source, pageCount);
  }

  function putLocal(entry) {
    return local?.put(localUrl, Response.json(entry));
  }

  function request(method, entry) {
    return fetch(`${shared.url}${path}`, {
      method,
      headers: {Authorization: `Bearer ${shared.token}`, 'Content-Type': 'application/json'},
      body: entry ? JSON.stringify(entry) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  }

  return {
    async get() {
      const cached = await local?.match(localUrl).then(read).catch(() => null);
      if (cached || !shared) return cached;
      const entry = await request('GET').then(read).catch(() => null);
      if (entry) await putLocal(entry)?.catch(() => {});
      return entry;
    },
    async put(entry) {
      validateEntry(entry, paper.source, pageCount);
      await Promise.allSettled([putLocal(entry), shared && request('PUT', entry)]);
    },
  };
}
