import '../../lang/model.js';
import {arxivPaper} from '../reader/arxiv.mjs';
import {cacheKey, validateEntry} from '../reader/cache-entry.mjs';

export default {
  async fetch(request, env) {
    const match = /^\/papers\/([^/]+)\/(v[1-9]\d*)\/([a-f0-9]{64})$/.exec(new URL(request.url).pathname);
    if (!match) return new Response(null, {status: 404});
    if (!env.BNITZ_CACHE_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.BNITZ_CACHE_TOKEN}`) {
      return new Response(null, {status: 401});
    }

    const [, encodedId, version, revision] = match;
    let paperId;
    try {
      paperId = decodeURIComponent(encodedId);
    } catch {
      return new Response(null, {status: 400});
    }
    const paper = arxivPaper(paperId + version);
    if (paper?.paperId !== paperId) return new Response(null, {status: 400});
    const key = `${cacheKey(paper, revision)}/entry.json`;
    if (request.method === 'GET') {
      const entry = await env.PAPER_CACHE.get(key);
      return entry ? new Response(entry.body, {
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'private, no-store'},
      }) : new Response(null, {status: 404});
    }
    if (request.method === 'PUT') {
      let entry;
      try {
        entry = validateEntry(await request.json(), paper.source);
      } catch {
        return new Response(null, {status: 400});
      }
      await env.PAPER_CACHE.put(key, JSON.stringify(entry));
      return new Response(null, {status: 204});
    }
    return new Response(null, {status: 405, headers: {Allow: 'GET, PUT'}});
  },
};
