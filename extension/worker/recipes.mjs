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

Return JSON with "planets" and "decision_note". Use unique IDs, exactly one core with parent "", and direct parents connecting every other planet to it. Each planet needs one or more verbatim excerpts occurring exactly once in the abstract, clearest first. Assign each excerpt to only one planet.

Write one decision_note sentence explaining your hardest role, grouping, or attachment choice using a specific abstract detail.`,
};

const bodyPassageSystemPrompt = `Extend the abstract map with body highlights as in the worked example. For each planet, read its abstract excerpts and its role relative to its parent.

Select up to three passages that explain, assess, or qualify that specific point, clearest first. Each must add a distinct detail beyond what the full abstract already says.

Choose excerpts that read clearly on their own. Prefer complete sentences and include adjacent sentences from the same block when they supply a needed explanation, comparison, or condition.

Return JSON with a "passages" array. For each passage, use the supplied "planetId" and "block" IDs. Copy "highlight" verbatim. Preserve qualifiers. If none qualify, return {"passages":[]}.`;

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
      model: 'openai/gpt-6-luna',
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
