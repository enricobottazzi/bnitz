import {recipe, revision} from '../worker-dist/recipe.mjs';
import {arxivPaper} from '../reader/arxiv.mjs';
import {openGenerationCache} from './cache.mjs';
import {generateMap} from './map.mjs';

class RequestError extends Error {
  constructor(status, message, headers) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

async function readJson(message, limit) {
  const tooLarge = () => new RequestError(413, 'The paper text is too large for BNITZ generation.');
  if (Number(message.headers.get('Content-Length')) > limit) throw tooLarge();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  const reader = message.body?.getReader();
  if (reader) {
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      text += decoder.decode(part.value, {stream: true});
    }
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new RequestError(400, 'BNITZ generation requires a JSON request.');
  }
}

async function complete(request, env, body, timeout) {
  if (!env.OPENROUTER_API_KEY) throw new RequestError(503, 'BNITZ generation is unavailable.');
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const {success} = await env.GENERATION_RATE.limit({key});
  if (!success) throw new RequestError(429, 'Too many BNITZ requests. Try again in a minute.', {'Retry-After': '60'});

  const signal = AbortSignal.timeout(timeout);
  let response, result;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      redirect: 'manual',
      signal,
    });
    result = await readJson(response, 256 * 1024);
  } catch {
    if (signal.aborted) throw new RequestError(504, 'BNITZ generation timed out.');
  }
  if (response?.status === 402 || result?.error?.metadata?.limit_source === 'openrouter_key_limit') {
    throw new RequestError(402, 'BNITZ generation has reached its spending limit.');
  }
  if (response?.status === 429) throw new RequestError(429, 'The model is busy. Try again shortly.');
  if (!response?.ok || !result || result.error) throw new RequestError(502, 'BNITZ could not reach its model.');
  return result.choices?.[0]?.message?.content;
}

const isText = value => typeof value === 'string' && Boolean(value.trim());
const isTextList = value => Array.isArray(value) && value.every(isText);

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/v1/abstract-map') {
      return Response.json({error: 'Unknown BNITZ endpoint.'}, {status: 404});
    }
    if (request.method !== 'POST') return Response.json({error: 'Use POST.'}, {status: 405, headers: {Allow: 'POST'}});
    try {
      const {arxivId, title, text, authors, affiliations, date} = await readJson(request, 32 * 1024) ?? {};
      const paper = arxivPaper(arxivId);
      if (!paper?.version || !isText(title) || !isText(text) || !isTextList(authors) || !isTextList(affiliations) ||
          (date !== null && !isText(date))) throw new RequestError(400, 'Invalid BNITZ generation input.');
      const input = {title, text, authors, affiliations, date};
      const cache = await openGenerationCache(env.GENERATION_CACHE, arxivId, revision, input);
      const cached = await cache?.get();
      const graph = cached ?? await generateMap(input, recipe, (body, timeout) => complete(request, env, body, timeout));
      if (!cached) await cache?.put(graph);
      return Response.json({version: 3, title, source: paper.source, text, nucleus: graph.nucleus, spans: graph.spans}, {
        headers: {'BNITZ-Cache': cached ? 'HIT' : cache ? 'MISS' : 'BYPASS'},
      });
    } catch (error) {
      if (error instanceof RequestError) {
        return Response.json({error: error.message}, {status: error.status, headers: error.headers});
      }
      return Response.json({error: 'BNITZ could not generate a valid result.'}, {status: 502});
    }
  },
};
