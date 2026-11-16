# Step 1 experiment with GROBID

1. Parse the PDF into structured text and PDF coordinates.
2. Build the BNITZ map from the abstract.
3. Select related passages from the body.
4. Highlight the selected passages in the PDF.

This run covers step 1. Each PDF was sent to a local GROBID 0.9.1 CRF container. The sample uses ten locally available arXiv PDFs, including the two examples from the extension README. Revision IDs come from the PDFs.

## Results

All ten PDFs produced a title and body. All 3,124 body sentences in the JSON exports had at least one box. The page counts matched the PDFs, and the sentence boxes were within their reported page bounds with a one-point tolerance. Step 4 is where the placement of those boxes will be checked against the rendered PDF.

Three abstract errors stood out when checking the source PDFs. On *Attention Is All You Need*, GROBID appended author footnotes to the printed abstract. On the quasar paper, the text of the abstract appeared at the beginning of the body and the abstract field was empty. On *GAM Coach*, the abstract field contained the caption of Figure 1. An abstract with coordinates can still contain the wrong text.

| arXiv revision | Paper | Raw GROBID output | Text and anchors | Abstract sentences | Body sentences |
|---|---|---|---|---:|---:|
| `1706.03762v7` | Attention Is All You Need | [TEI](results/1706.03762v7.tei.xml) | [JSON](results/1706.03762v7.json) | 16 | 198 |
| `1810.04805v2` | BERT | [TEI](results/1810.04805v2.tei.xml) | [JSON](results/1810.04805v2.json) | 5 | 307 |
| `2001.08361v1` | Scaling Laws for Neural Language Models | [TEI](results/2001.08361v1.tei.xml) | [JSON](results/2001.08361v1.json) | 6 | 475 |
| `2211.14329v2` | Detection of stellar light from quasar host galaxies | [TEI](results/2211.14329v2.tei.xml) | [JSON](results/2211.14329v2.json) | 0 | 254 |
| `2302.14165v2` | GAM Coach | [TEI](results/2302.14165v2.tei.xml) | [JSON](results/2302.14165v2.json) | 5 | 574 |
| `2309.00941v2` | Emergent Linear Representations in World Models | [TEI](results/2309.00941v2.tei.xml) | [JSON](results/2309.00941v2.json) | 7 | 250 |
| `2406.18747v2` | A Stem-Agnostic Single-Decoder System | [TEI](results/2406.18747v2.tei.xml) | [JSON](results/2406.18747v2.json) | 7 | 201 |
| `2410.13641v2` | An Active Learning Framework for Inclusive Generation | [TEI](results/2410.13641v2.tei.xml) | [JSON](results/2410.13641v2.json) | 8 | 240 |
| `2501.12948v1` | DeepSeek-R1 | [TEI](results/2501.12948v1.tei.xml) | [JSON](results/2501.12948v1.json) | 7 | 270 |
| `2603.19299v1` | PRIME-CVD | [TEI](results/2603.19299v1.tei.xml) | [JSON](results/2603.19299v1.json) | 10 | 355 |

## Full versus CRF

GROBID Full fixed **zero of the three abstract errors**. Seven papers had identical exported abstract text across the two builds, including the three with known errors. Across the three papers that changed, Full removed one footnote marker, added chart text to an abstract, and dropped an abstract sentence. The differences below were checked against the printed PDFs.

| arXiv revision | What Full returned | Full output |
|---|---|---|
| `1706.03762v7` | Transformer abstract still includes author footnotes | [JSON](results/full/1706.03762v7.json) · [TEI](results/full/1706.03762v7.tei.xml) |
| `1810.04805v2` | BERT abstract text unchanged | [JSON](results/full/1810.04805v2.json) · [TEI](results/full/1810.04805v2.tei.xml) |
| `2001.08361v1` | Scaling Laws abstract text unchanged | [JSON](results/full/2001.08361v1.json) · [TEI](results/full/2001.08361v1.tei.xml) |
| `2211.14329v2` | Abstract field still empty. The quasar abstract appears at the start of the body | [JSON](results/full/2211.14329v2.json) · [TEI](results/full/2211.14329v2.tei.xml) |
| `2302.14165v2` | GAM Coach abstract field still contains the Figure 1 caption | [JSON](results/full/2302.14165v2.json) · [TEI](results/full/2302.14165v2.tei.xml) |
| `2309.00941v2` | Removed the trailing footnote marker from the Othello abstract | [JSON](results/full/2309.00941v2.json) · [TEI](results/full/2309.00941v2.tei.xml) |
| `2406.18747v2` | Music source separation abstract text unchanged | [JSON](results/full/2406.18747v2.json) · [TEI](results/full/2406.18747v2.tei.xml) |
| `2410.13641v2` | Inclusive generation abstract text unchanged | [JSON](results/full/2410.13641v2.json) · [TEI](results/full/2410.13641v2.tei.xml) |
| `2501.12948v1` | Appended Figure 1 axis labels to the DeepSeek-R1 abstract | [JSON](results/full/2501.12948v1.json) · [TEI](results/full/2501.12948v1.tei.xml) |
| `2603.19299v1` | Dropped the closing licence sentence from the PRIME-CVD abstract field | [JSON](results/full/2603.19299v1.json) · [TEI](results/full/2603.19299v1.tei.xml) |

Full returned 3,166 body sentences versus 3,124 for CRF. All but one Full sentence entry, which contained only punctuation, had coordinates. All reported abstract and body sentence boxes fell within their pages with a one-point tolerance. The counts give the number of entries each build produced. Body completeness and rendered placement were outside the comparison.

Both runs used the same PDF files and request settings below. The Full run used GROBID's public mirror, which runs the `0.9.1-full` image with the DeLFT header model enabled. The local Full container exited with a native TensorFlow `SIGILL` on the emulated `amd64` runtime. [Mirror image](https://huggingface.co/spaces/grobidOrg/grobid-full2/blob/main/Dockerfile) · [Mirror model settings](https://huggingface.co/spaces/grobidOrg/grobid-full2/blob/main/grobid.yaml)

## Output format

The JSON extracts the title, abstract, body and appendices for inspection. It keeps section order and joins adjacent tagged sentences with spaces to make paragraph text readable. The raw TEI also contains the other structures GROBID detected, including figures, footnotes and references.

The first sentence of the BERT abstract spans four rectangles. Each entry contains `page,x,y,width,height` in PDF units with the origin at the upper left. [GROBID coordinate format](https://grobid.readthedocs.io/en/latest/Coordinates-in-PDF/)

```json
{
  "text": "We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers.",
  "coords": [
    "1,89.01,246.89,184.25,8.64",
    "1,89.01,258.46,184.25,9.03",
    "1,89.01,270.41,184.25,9.03",
    "1,89.01,282.37,56.72,8.96"
  ]
}
```

## Reproduce a parse

From this directory, with [GROBID](https://grobid.readthedocs.io/en/latest/Grobid-docker/) running on port 8070 and the revisioned PDF downloaded locally, run the following commands.

```sh
curl -fsS -F input=@1810.04805v2.pdf -F consolidateHeader=0 \
  -F segmentSentences=1 -F teiCoordinates=s -F teiCoordinates=p -F teiCoordinates=head \
  http://127.0.0.1:8070/api/processFulltextDocument -o results/1810.04805v2.tei.xml
python3 export.py
```

To regenerate the Full JSON views from the saved TEI, run `python3 export.py results/full`.
