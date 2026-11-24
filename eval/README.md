# Abstract-map eval

## Run locally

From the BNITZ checkout, with Node 24 or newer:

```sh
node eval/server.mjs
```

Open http://127.0.0.1:4174/eval/ and click **Import config** to choose a `config_<timestamp>.json` file. Import initializes its record, or resumes the same run with its saved maps and feedback. Paste your OpenRouter key and click **Generate maps** to start paid model requests. The key stays in page memory and is never saved in run files. `OPENROUTER_API_KEY` remains an optional server fallback.

## 1. Compare the current prompt and challenger blind

Choose *x* models and a batch of arXiv abstracts. Every model maps every abstract twice: once with Prompt A (the control) and once with Prompt B (the change being tested). Each prompt has its own six worked examples. Keep test abstracts out of both sets of examples. Abstracts can come from familiar papers in `examples/` or `archive/` when they are held out from the worked examples.

Edit models, papers, prompts, and examples in the config before importing it. Prompts, examples, and recipes use the labels **A** and **B**. Each prompt has its own six examples in the supplied JSON format (`readerMap`, `input`, `output`); the matching recipe messages must contain the same prompt and examples. To change an already imported run, create a config with a new timestamp.

Batch size follows the config’s paper list, including ten-paper runs.

Generate and validate both maps with the existing abstract mapper. Within each pair, use the same model, paper, output schema, and generation settings. The current recipe requests low reasoning effort and a 6,000-token limit, with temperature and top-p unset. Imported configs preserve their frozen settings. Test papers matching a worked example are rejected.

For each abstract, open the arXiv link and draw your own map in the deployed BNITZ Playground. Use **Import bnitz** next to **Draw in BNITZ** to attach its exported `.bnitz` file. The map must use the same abstract; it appears under **Your map** and is saved in the record and export.

Click **Reveal** to see one anonymous pair per model. Pairs and their left/right order are shuffled for each abstract. Click planets to inspect their highlights, then give every map a **1–5 score** and a **freeform comment**. Feedback saves automatically, preserving the same maps and order when you resume from the home screen or the run’s URL. Model and prompt identities stay hidden until all maps have scores and nonempty comments.

## 2. Discuss the results and choose the next pair

Export the batch’s `record.json` and attach it to a fresh Codex chat. The record includes each paper’s link and model input, the exact prompts, examples and settings, and every map with its anonymous label, model ID, prompt version, decision note, score, and comment.

Discuss what you liked or disliked. For each model, choose which prompt to carry forward and what change to test against it next. Repeat step 1 on fresh abstracts and save a separate record for each batch.

## Run files

Each run shares one UTC timestamp across exactly two files in the ignored `eval/runs/` folder:

- `config_<timestamp>.json`: paper inputs, models, exact prompts, each prompt’s examples, schema, and generation settings.
- `record_<timestamp>.json`: maps, anonymous labels and order, generation attempts, scores, and comments.

The files retain identities throughout; the scoring interface hides them. Export embeds the config in the record so the downloaded record is self-contained. Restarting the server preserves finished maps and feedback; **Generate maps** resumes missing results.

The prompts are stored directly in each config.

## Tests

```sh
node --test eval/server.test.mjs
```

Tests use mocked model responses and temporary files, with no external requests.
