import BNITZModel from '../../lang/model.js';
import {recipes} from '../worker-dist/recipe.mjs';
import {arxivPaper, bodySeparator, bodyText} from '../reader/arxiv.mjs';
import {openPaperCache} from './cache.mjs';
import {generateMap} from './map.mjs';
import {generateBodyHighlights, paperMap} from './passages.mjs';

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
const isBody = value => Array.isArray(value) && value.every((block, index) =>
  block?.id === `b${index + 1}` && isText(block.text) && !block.text.includes(bodySeparator));

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/v1/paper-map') {
      return Response.json({error: 'Unknown BNITZ endpoint.'}, {status: 404});
    }
    if (request.method !== 'POST') return Response.json({error: 'Use POST.'}, {status: 405, headers: {Allow: 'POST'}});
    const headers = new Headers({'Access-Control-Expose-Headers': 'BNITZ-Cache, Server-Timing'});
    const timed = async (step, generate) => {
      const started = performance.now();
      try {
        return await generate();
      } finally {
        headers.append('Server-Timing', `step${step};dur=${Math.round(performance.now() - started)}`);
      }
    };
    try {
      const {arxivId, title, abstract, authors, affiliations, date, body} = await readJson(request, 1024 * 1024) ?? {};
      const paper = arxivPaper(arxivId);
      if (!paper?.version || arxivId.length > 128 || !isText(title) || !isText(abstract) ||
          !isTextList(authors) || !isTextList(affiliations) || (date !== null && !isText(date)) || !isBody(body)) {
        throw new RequestError(400, 'Invalid BNITZ generation input.');
      }
      const input = {arxivId, title, abstract, authors, affiliations, date, body: body.map(({id, text}) => ({id, text}))};
      const text = {arxivId, abstract, body: bodyText(body)};
      const cache = await openPaperCache(env.GENERATION_CACHE, text);
      const cached = await cache?.get();
      if (cached) {
        try {
          const result = BNITZModel.validateArxiv(cached, text);
          headers.set('BNITZ-Cache', 'HIT');
          return Response.json(result, {headers});
        } catch {
          // Regenerate stale or invalid cache entries.
        }
      }
      const run = (payload, timeout) => complete(request, env, payload, timeout);
      const map = await timed(2, () => generateMap(input, recipes.abstract, run));
      const highlights = body.length ? await timed(3, () => generateBodyHighlights(input, map, recipes.body, run)) : undefined;
      const result = BNITZModel.validateArxiv(paperMap(map, highlights), text);
      await cache?.put(result);
      headers.set('BNITZ-Cache', cache ? 'MISS' : 'BYPASS');
      return Response.json(result, {headers});
    } catch (error) {
      if (error instanceof RequestError) {
        for (const [name, value] of Object.entries(error.headers ?? {})) headers.set(name, value);
        return Response.json({error: error.message}, {status: error.status, headers});
      }
      return Response.json({error: 'BNITZ could not generate a valid result.'}, {status: 502, headers});
    }
  },
};
