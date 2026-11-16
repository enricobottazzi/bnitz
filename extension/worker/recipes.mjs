import BNITZModel from '../../lang/model.js';

const mapSystemPrompt = `Map the abstract as the smallest tree that preserves its argument. Use the metadata as context.

Choose one nucleus (the main result, claim, or proposal). Attach each other planet to the claim it serves or tests. Use problem (gap or question), background (context), method (approach), evidence (support or test), implication (what follows), or scope (limits). Keep brief qualifiers with their claim.

Return only JSON in this shape.
{"planets":[{"id":"...","parent":"...","relation":"...","highlights":["..."]}]}

- Give each planet a unique ID. The root has relation "nucleus" and parent "". All other parents are planet IDs that lead back to the root.
- Give each planet one or more verbatim highlights from the abstract. Put the excerpt that best states the point first. Keep enough context to understand the point. Each highlight must occur exactly once in the abstract.`;

function object(properties) {
  return {type: 'object', properties, required: Object.keys(properties), additionalProperties: false};
}

const string = {type: 'string'};
const schema = object({
  planets: {type: 'array', minItems: 1, items: object({
    id: string,
    parent: string,
    relation: {type: 'string', enum: ['nucleus', ...Object.keys(BNITZModel.relations)]},
    highlights: {type: 'array', minItems: 1, items: string},
  })},
});

export function mapRecipe(examples) {
  const messages = [
    {role: 'system', content: mapSystemPrompt},
    ...examples.flatMap(({input, output}) => [
      {role: 'user', content: JSON.stringify(input)},
      {role: 'assistant', content: JSON.stringify(output)},
    ]),
  ];
  const settings = {
    model: 'google/gemini-4-carbon',
    max_tokens: 6000,
    reasoning: {effort: 'low'},
    provider: {require_parameters: true},
    response_format: {type: 'json_schema', json_schema: {name: 'bnitz_abstract_map', strict: true, schema}},
  };
  const retryPrompt = 'Return a corrected map with highlights that each occur exactly once in the abstract.';
  return {messages, settings, attempts: 2, timeout: 45000, retryPrompt};
}
