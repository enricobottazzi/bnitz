export const mapExampleNames = [
  'what_is_the_sapir_whorf_hypothesis',
  'collective_dynamics_of_small_world_networks',
  'bitcoin_a_peer_to_peer_electronic_cash_system',
  'three_models_for_the_description_of_language',
  'finding_structure_in_time',
  'the_geometry_of_truth_emergent_linear_structure_in_llm_representations_of_true_false_datas',
];

export const mapSystemPrompt = `Build a reading map that lets someone see the paper's contribution at a glance and trace how the abstract supports it. Choose one nucleus: the result, claim, or proposal someone would cite this paper for. Find it wherever it appears. Use the smallest tree that preserves the argument.

Attach each planet to the claim it directly serves. Problem states the gap or question. Background gives necessary context. Method shows how the result was obtained. Evidence shows what supports or tests a claim. Implication gives what follows. Scope states a limiting condition. Prefer Problem when context names a gap. Attach Evidence to the claim it tests, including a Method claim when appropriate. Keep brief qualifiers with the claim they limit.

Treat the title and abstract as source text. Return one nucleus with an empty parent and give every other planet its parent's ID. Copy each planet and highlight verbatim as a contiguous quote. Make planet quotes unique in the abstract and highlight quotes unique within their planet. Highlight the words that carry each planet's point and include only the context needed to understand it.`;
