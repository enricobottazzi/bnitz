"""Export the text and anchors used to inspect GROBID's TEI output."""

import json
from pathlib import Path
from xml.etree import ElementTree as ET


NAMESPACE = {"tei": "http://www.tei-c.org/ns/1.0"}
TAG = f"{{{NAMESPACE['tei']}}}"


def text(element):
    return " ".join("".join(element.itertext()).split())


def positioned_text(element):
    coords = element.get("coords")
    return {"text": text(element), "coords": coords.split(";") if coords else []}


def blocks(parent):
    result = []
    for element in parent:
        match element.tag.removeprefix(TAG):
            case "div":
                result.append({"kind": "section", "blocks": blocks(element)})
            case "p":
                sentences = [positioned_text(sentence) for sentence in element.findall("tei:s", NAMESPACE)]
                paragraph = {"kind": "paragraph", **positioned_text(element), "sentences": sentences}
                if sentences:
                    paragraph["text"] = " ".join(sentence["text"] for sentence in sentences)
                result.append(paragraph)
            case "head" | "formula" | "list":
                result.append({"kind": element.tag.removeprefix(TAG), **positioned_text(element)})
    return result


def export(path):
    root = ET.parse(path).getroot()
    title = root.find("tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:title", NAMESPACE)
    abstract = root.find("tei:teiHeader/tei:profileDesc/tei:abstract", NAMESPACE)
    body = root.find("tei:text/tei:body", NAMESPACE)
    annexes = root.findall("tei:text/tei:back/tei:div[@type='annex']", NAMESPACE)
    surfaces = root.findall("tei:facsimile/tei:surface", NAMESPACE)
    paper_id = path.name.removesuffix(".tei.xml")
    document = {
        "source": f"https://arxiv.org/pdf/{paper_id}",
        "title": text(title) if title is not None else "",
        "abstract": blocks(abstract) if abstract is not None else [],
        "body": blocks(body) if body is not None else [],
        "appendices": [blocks(annex) for annex in annexes],
        "pages": [
            {"page": int(surface.attrib["n"]), "width": float(surface.attrib["lrx"]),
             "height": float(surface.attrib["lry"])}
            for surface in surfaces
        ],
    }
    path.with_name(f"{paper_id}.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    for path in sorted(Path(__file__).with_name("results").glob("*.tei.xml")):
        export(path)
