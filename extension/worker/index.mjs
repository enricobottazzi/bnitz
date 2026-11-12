import {recipes, revision} from '../worker-dist/recipe.mjs';
import {matchPdfQuote} from '../reader/abstract.mjs';
import {openGenerationCache} from './cache.mjs';
import {generateMap} from './map.mjs';

const paperLimit = 512 * 1024;
const responseLimit = 256 * 1024;

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
  const reader = message.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
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
      headers: {Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      redirect: 'manual',
      signal,
    });
    result = await readJson(response, responseLimit);
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

const isString = value => typeof value === 'string';
const isText = value => isString(value) && Boolean(value.trim());
const isArrayOf = (value, test) => Array.isArray(value) && value.every(test);
const invalidInput = () => new RequestError(400, 'Invalid BNITZ generation input.');

async function runRecipe(recipe, input, complete) {
  const {system, settings, timeout} = recipe;
  const content = await complete({...settings, messages: [
    {role: 'system', content: system},
    {role: 'user', content: JSON.stringify(input)},
  ]}, timeout);
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const routes = {
  '/v1/extract': {
    limit: paperLimit,
    input({title, arxivAbstract, pdfLines}) {
      if (!isText(title) || !isText(arxivAbstract) || !isArrayOf(pdfLines, isString) || !pdfLines.length) {
        throw invalidInput();
      }
      return {title, arxivAbstract, pdfLines};
    },
    run(input, complete) {
      return runRecipe(recipes.extraction, input, complete);
    },
    canCache(result, {pdfLines}) {
      const {lines, skipStart, skipEnd, body} = result ?? {};
      const lineExists = id => Number.isInteger(id) && id >= 1 && id <= pdfLines.length;
      return isArrayOf(lines, lineExists) && lines.length > 0 && new Set(lines).size === lines.length &&
        isString(skipStart) && isString(skipEnd) && isArrayOf(body, range =>
          lineExists(range?.first) && lineExists(range?.last) && range.first <= range.last);
    },
  },
  '/v1/map': {
    limit: 32 * 1024,
    input({title, text}) {
      if (!isText(title) || !isText(text)) throw invalidInput();
      return {title, text};
    },
    run(input, complete) {
      return generateMap(input, recipes.map, complete);
    },
  },
  '/v1/passages': {
    limit: paperLimit,
    input({title, planets, blocks}) {
      if (!isText(title) || !isArrayOf(planets, planet =>
        isText(planet?.id) && isText(planet.quote) && isArrayOf(planet.focus, isString)) ||
        !isArrayOf(blocks, block => Number.isSafeInteger(block?.id) && isString(block.text))) {
        throw invalidInput();
      }
      return {
        title,
        planets: planets.map(({id, quote, focus}) => ({id, quote, focus})),
        blocks: blocks.map(({id, text}) => ({id, text})),
      };
    },
    run(input, complete) {
      return runRecipe(recipes.passages, input, complete);
    },
    canCache(result, {planets, blocks}) {
      if (!Array.isArray(result?.passages)) return false;
      if (!result.passages.length) return true;
      const planetIds = new Set(planets.map(({id}) => id));
      const byId = new Map(blocks.map(block => [block.id, block]));
      return result.passages.some(passage => {
        const block = byId.get(passage?.block);
        return block && planetIds.has(passage.planetId) && isText(passage.quote) && passage.quote.length <= 300 &&
          matchPdfQuote(block, passage.quote);
      });
    },
  },
};

function respond(result, cacheStatus) {
  return Response.json(result, {headers: {'BNITZ-Recipe': revision, 'BNITZ-Cache': cacheStatus}});
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!Object.hasOwn(routes, path)) return Response.json({error: 'Unknown BNITZ endpoint.'}, {status: 404});
    if (request.method !== 'POST') return Response.json({error: 'Use POST.'}, {status: 405, headers: {Allow: 'POST'}});
    const route = routes[path];
    try {
      const payload = await readJson(request, route.limit);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidInput();
      const input = route.input(payload);
      const cache = await openGenerationCache(env.GENERATION_CACHE, payload.arxivId, revision, path, input);
      const cached = await cache?.get();
      if (cached != null) return respond(cached, 'HIT');

      const result = await route.run(input, (body, timeout) => complete(request, env, body, timeout));
      if (cache && result != null && (route.canCache?.(result, input) ?? true)) await cache.put(result);
      return respond(result, cache ? 'MISS' : 'BYPASS');
    } catch (error) {
      if (error instanceof RequestError) {
        return Response.json({error: error.message}, {status: error.status, headers: error.headers});
      }
      return Response.json({error: 'BNITZ could not generate a valid result.'}, {status: 502});
    }
  },
};
