export async function loadOpenRouterKey(signal) {
  const response = await fetch('./local-key', {signal});
  if (!response.ok) throw new Error('The local BNITZ build is missing its OpenRouter key.');
  return (await response.text()).trim();
}

export async function complete(apiKey, body, signal = AbortSignal.timeout(45000)) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  const completion = await response.json();
  return completion.choices?.[0]?.message?.content;
}
