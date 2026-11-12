import config from './config.mjs';

export function generationClient(paper) {
  const arxivId = paper.version ? paper.id : undefined;
  let matchesRecipe = true;
  return {
    async request(operation, input) {
      const response = await fetch(`${config.origin}/v1/${operation}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...input, arxivId}),
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `BNITZ generation returned HTTP ${response.status}.`);
      matchesRecipe &&= response.headers.get('BNITZ-Recipe') === config.generationRevision;
      return result;
    },
    get cacheable() { return matchesRecipe; },
  };
}
