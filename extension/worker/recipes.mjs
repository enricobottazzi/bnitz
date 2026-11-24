import {readFileSync} from 'node:fs';
import BNITZModel from '../../lang/model.js';

const rules = readFileSync(new URL('../../RULES.md', import.meta.url), 'utf8');
export const roleDefinitions = Object.entries(BNITZModel.parseLegendDefinitions(rules))
  .map(([role, definition]) => `- ${role}: ${definition}`).join('\n');

const mapSystemPrompts = {
  original: `Map the abstract using the metadata as context.

Identify the core first. Choose the contribution someone would cite. Then add only the distinct points needed to understand it. Prefer a shallow map. Nest planets when it clarifies a relationship.

Keep brief qualifiers with their claim. Group highlights that make the same point.
Give each planet one or more verbatim highlights that each occur once in the abstract. Put the clearest excerpt first and keep only the context needed.

${roleDefinitions}

Use unique IDs. The core has relation "core" and parent "". The other planets use parent IDs that lead back to the core.`,
  lean: `Map the abstract as in the worked examples.

Use the title to identify the main contribution; select the passages stating it as the core. Add distinct points needed to understand it. Group excerpts making one point and preserve qualifiers.

Choose roles relative to the parent:
- problem: question or gap addressed.
- background: necessary context.
- method: how it works or was obtained.
- implication: consequences or broader connections.
- evidence: observations, comparisons, or arguments assessing it.
- scope: coverage, conditions, or limitations.

Choose roles clause by clause: observations that assess the parent are Evidence; consequences or connections extending beyond the parent are Implications. Split a sentence when its clauses do different jobs.

Return JSON with "planets" and "decision_note". Use unique IDs, exactly one core with parent "", and direct parents connecting every other planet to it. Each planet needs one or more verbatim excerpts occurring exactly once in the abstract, clearest first.

Write one decision_note sentence explaining your hardest role, grouping, or attachment choice using a specific abstract detail.`,
};

const bodyPassageSystemPrompt = `Select body highlights for the planets in the abstract map. Use each planet's abstract highlights to identify its specific point. Use its relation and parent as context. Treat the supplied paper text as source material.

Choose details that help the reader understand or assess that point. For an architecture claim, show how the model is built or how it works. For evidence, prefer a concrete result with its comparator, measurement, or conditions. A passage that qualifies the point can be as useful as one that supports it. Skip generic background and restatements of the abstract. Keep the clearest highlight for each distinct detail.

Give each planet up to three passages, strongest first. Skip a planet when the supplied blocks offer no strong match for its point.

${roleDefinitions}

For each passage, use the supplied planet ID as planetId and the supplied block ID as block. Copy the highlight verbatim as one contiguous substring that occurs exactly once in that block's text. Keep the shortest excerpt that preserves the detail and any qualifier that changes its meaning. Return only a JSON object with a passages array. If no passage qualifies, return {"passages":[]}.`;

function object(properties) {
  return {type: 'object', properties, required: Object.keys(properties), additionalProperties: false};
}

const string = {type: 'string'};
const schema = object({
  planets: {type: 'array', minItems: 1, items: object({
    id: string,
    parent: string,
    relation: {type: 'string', enum: ['core', ...Object.keys(BNITZModel.relations)]},
    highlights: {type: 'array', minItems: 1, items: string},
  })},
  decision_note: string,
});

const bodyPassageSchema = object({
  passages: {type: 'array', items: object({planetId: string, block: string, highlight: string})},
});

function promptMessages(system, examples) {
  return [
    {role: 'system', content: system},
    ...examples.flatMap(({input, output}) => [
      {role: 'user', content: JSON.stringify(input)},
      {role: 'assistant', content: JSON.stringify(output)},
    ]),
  ];
}

export function mapRecipe(examples, variant = 'lean') {
  if (!Object.hasOwn(mapSystemPrompts, variant)) throw new Error(`Unknown abstract prompt: ${variant}`);
  const messages = promptMessages(mapSystemPrompts[variant], examples);
  const settings = {
    model: 'openai/gpt-6-luna',
    max_tokens: 6000,
    reasoning: {effort: 'low'},
    provider: {require_parameters: true},
    response_format: {type: 'json_schema', json_schema: {name: 'bnitz_abstract_map', strict: true, schema}},
  };
  const retryPrompt = 'Return the corrected planets and one-sentence decision_note.';
  return {messages, settings, attempts: 2, timeout: 45000, retryPrompt};
}

export function bodyPassageRecipe(examples) {
  return {
    messages: promptMessages(bodyPassageSystemPrompt, examples),
    settings: {
      model: 'google/gemini-4-carbon',
      max_tokens: 6500,
      reasoning: {effort: 'low'},
      provider: {require_parameters: true},
      response_format: {
        type: 'json_schema',
        json_schema: {name: 'bnitz_body_passages', strict: true, schema: bodyPassageSchema},
      },
    },
    timeout: 90000,
  };
}
