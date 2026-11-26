# Chrome Store packages

Version tags record versions published to the Chrome Web Store. Keep each submitted ZIP here unchanged and include it in the matching version's tagged commit. Website updates use ordinary commits on `main`; GitHub releases are not used.

`v0.2.1` is a Git-only tag for the Worker, evaluation and map updates. `v0.2.2` is a Git-only tag for the interdisciplinary Worker examples, simplified tests and removal of the evaluation suite. The Chrome manifest for both tags is `0.2.0`.

`v0.2.5` is a Git-only tag for GPT-6 Luna abstract mapping with the evaluated Prompt B, automatic cache invalidation when generation recipes change, the local evaluation interface, and reviewed maps. The Chrome manifest remains `0.2.4`.

`v0.2.6` is a Git-only tag for GPT-6 Luna body highlighting with the full abstract and a revised worked example.

| Chrome version | Store ZIP | Downloaded Store CRX |
| --- | --- | --- |
| 0.1.4 beta | Original ZIP unavailable | [BNITZ-v0.1.4-beta.crx](BNITZ-v0.1.4-beta.crx) |
| 0.2.0 | [BNITZ-v0.2.0.zip](BNITZ-v0.2.0.zip) | [BNITZ-v0.2.0.crx](BNITZ-v0.2.0.crx) |
| 0.2.3 | [BNITZ-v0.2.3.zip](BNITZ-v0.2.3.zip) | — |
| 0.2.4 | [BNITZ-v0.2.4.zip](BNITZ-v0.2.4.zip) | — |

Historical exception: the existing `v0.2.0` source tag includes privacy setup added after its submitted ZIP was built. The archived 0.2.0 ZIP and CRX preserve the actual Store build and do not contain that setup. Existing tags are otherwise retained unchanged.

The old beta ZIP could not be located; the original Store CRX is preserved instead. Its tag records the submitted ZIP's SHA-256 as `b8af5f9f48b5ceba1a3ffbabffa2db6434bc4f3522411994ca3db339c7195ef7`.

SHA-256 of the archived files:

```text
f7a2b10de85b76d38f2db89ac4cade28e63b3c18e57e86f47a0a4ac15347ba89  BNITZ-v0.2.0.zip
26b6b9787ba00d160d1cdfda6ae1d722159ae9fcd883a1fd9b5917b60e2de0ef  BNITZ-v0.2.0.crx
6076a10bbd2bd6e5310af7a5de467bd5e62bfcd5b68804d26a9c6f3a2cbb4a08  BNITZ-v0.1.4-beta.crx
bf10e133a762ad9850c3d6f163c8df1938d368e094b41dd15cde4dc249c86b91  BNITZ-v0.2.3.zip
52f2b072d4dff2cb41d9d3629dd5e86223ec69b633edfa76f790f97b95745959  BNITZ-v0.2.4.zip
```
