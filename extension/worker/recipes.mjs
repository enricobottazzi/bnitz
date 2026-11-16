import BNITZModel from '../../lang/model.js';

const roleDefinitions = [
  `- nucleus: ${BNITZModel.nucleusDefinition}`,
  ...Object.entries(BNITZModel.relations).map(([role, [, , , definition]]) => `- ${role}: ${definition}`),
].join('\n');

const mapSystemPrompt = `Map the abstract using the metadata as context.

Identify the nucleus first. Choose the contribution someone would cite. Then add only the distinct points needed to understand it. Prefer a shallow map. Nest planets when it clarifies a relationship.

Keep brief qualifiers with their claim. Group highlights that make the same point.
Give each planet one or more verbatim highlights that each occur once in the abstract. Put the clearest excerpt first and keep only the context needed.

${roleDefinitions}

Use unique IDs. The nucleus has relation "nucleus" and parent "". The other planets use parent IDs that lead back to the nucleus.`;

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
