# BNITZ abstract map evaluation

Compare four configurations on the same 12 reviewed abstracts. For each generator, run the original prompt with 6 and 12 worked examples and the lean prompt with 6 and 12. Use the first six examples in file order or all twelve. Each configuration gets one fresh run per abstract, using the Worker's abstract-map settings, grounding checks and correction attempt. [Prompts](../extension/worker/recipes.mjs) · [Worked examples](../extension/worker/abstract-map-examples.json)

Compare **Gemini 4 Carbon** and **GPT-6.2 Astra** at the Worker's low reasoning setting. **Claude Opus 5.5 with high reasoning** judges all 96 maps across the eight model/configuration combinations. [Gemini 4 Carbon](https://openrouter.ai/google/gemini-4-carbon) · [GPT-6.2 Astra](https://openrouter.ai/openai/gpt-6.2-astra) · [Claude Opus 5.5](https://openrouter.ai/anthropic/claude-opus-5.5)

## Run

The [case manifest](cases.json) contains all 12 evaluation abstracts, their splits and their reviewed map paths. These papers are separate from the worked examples shown to the generator. All eight combinations are scored on both sets with the same rubric.

- **Development (`dev`), six papers.** Use these results to choose the model and prompt. Pick the combination with the most passing maps, breaking ties by lower generation cost.
- **Final (`final`), six different papers.** Record your choice before opening these results. Its score on these six shows how well it did on papers you did not use to choose it.

Use Node 22+ from the repository root. The first command checks the 12 demonstrations, the 12 references, their verbatim highlights and the four recipes offline. Set `OPENROUTER_API_KEY` in the environment for live runs. Each live command writes to a new output directory.

```sh
node eval/run.mjs --check

models=google/gemini-4-carbon,openai/gpt-6.2-astra
node eval/run.mjs --split dev --models "$models" --out eval-results/dev
```

Each split generates 48 maps. To pilot a single abstract, add `--paper toy_models_of_superposition` to the development command and choose a separate output directory.

## Judge and select

Opus compares the anonymous candidate with the reviewed map using the same seven planet definitions as the generators. It scores two questions independently and gives one sentence citing the abstract for each score. [Judge prompt](run.mjs#L16)

| Criterion | Scoring |
|---|---|
| Nucleus | **1** if it captures the main contribution and its essential qualifiers, **0** otherwise. |
| Roles and parents | **1** if the map preserves the relationships, **0.5** if the main relationships are sound but a secondary point is missing, mislabeled or attached to the wrong parent, **0** if the main supporting relationships are missing or misrepresented. |

A valid map earns a full pass at **2/2**. Different splits or merges are acceptable when they preserve the relationships. A map that fails validation after the Worker's correction scores zero. A provider or judge error leaves the score open.

Gemini 4 Carbon Original-6 won development and was selected before the final run. It earned 3/6 full passes and averaged 1.75/2 on development. Lean-6 earned 2/6 and averaged 1.67/2.

```sh
node eval/run.mjs --split final --models "$models" --out eval-results/final
```

## Worker default

We chose **Gemini 4 Carbon Lean-6** because its shorter prompt is easier to maintain and it matched Original-6 on 11 of 12 abstracts. The two configurations earned identical scores on each final abstract, with 2/6 full passes and a mean of 1.67/2. The only difference was on the development paper *Statistical Mechanics of Complex Networks*, where Lean-6 labeled the review’s coverage as Method and Original-6 correctly labeled it Scope.

## Read the report

Open `report.md` in each output directory. Its summary compares passes, mean scores, invalid maps, service errors, and average generation cost and time including retries. Each scored map shows both scores alongside their explanations. The linked JSON trace includes the requests, replies, generated decision note, validation outcome, token usage, cost and timing. Judging costs are reported separately. [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)

The detailed results are grouped by model, then by prompt and example count. Each paper includes the generator’s decision note and downloadable `.bnitz` files for the generated map and reviewed reference. Import either file into the [Playground](https://bnitz.org/#playground).

The [24 human decision notes](../archive/decision_notes.txt) are available for reviewing disagreements. Only the selected worked examples supply notes to the generator.
