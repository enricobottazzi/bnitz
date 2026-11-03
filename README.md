# BNITZ

The structure of ideas.

The website lives in `interface/`. Article sources live in `interface/articles/`; `interface/src/` contains the page template, CSS and JavaScript. `interface/dist/` is generated output: edit the sources, then rebuild.

## Run locally

Requires Python 3.9 or newer. No packages or account are needed.

From the repository root:

```sh
python3 interface/build.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory interface/dist
```

Open http://127.0.0.1:4173/. Stop the server with Ctrl-C. After changing an article or the interface source, run the build again and refresh the browser. Open a reading directly with `/#readings/filename-without-md`.

## Add an article

Create `interface/articles/my-article.md`. Its filename becomes its URL slug; use lowercase letters, numbers and hyphens, starting with a letter. Each file contains three parts, in this order:

1. A fenced `bnitz` block containing JSON metadata: `title`, `author` and an integer `year`.
2. Markdown text divided into named sections using `<!-- passage: name -->` markers.
3. One fenced `svg` block describing the map and the text sections each component refers to.

For example, save this entire content as `interface/articles/my-article.md`:

````markdown
```bnitz
{
  "title": "An example argument",
  "author": "Your name",
  "year": 2026
}
```

<!-- passage: premise -->

==This is the key sentence of the premise.== This is its supporting detail.

<!-- passage: conclusion -->

==This is the conclusion.== More explanation can go here, with **bold**, *italic* or `code`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 680">
  <g id="triangle" aria-label="Premise" data-passages="premise">
    <polygon points="230,40 140,150 320,150" />
  </g>
  <g id="circle" aria-label="Conclusion and premise" data-passages="conclusion premise" data-outline="true">
    <circle cx="230" cy="340" r="120" />
  </g>
</svg>
```
````

Run `python3 interface/build.py`. The article automatically appears in the reading list and gets a reader at `/#readings/my-article`. Files are listed alphabetically by filename. Remove a source file and rebuild to remove an article; no index or JavaScript edits are needed.

`interface/articles/the-bitter-lesson.md` is the complete working example, with the existing 17-component map. Its associations are illustrative, not an analysis of Sutton's argument. Its text was transcribed from [the supplied PDF](https://www.cs.utexas.edu/~eunsol/courses/data/bitter_lesson.pdf).

## Write the text and its highlights

Section names must be unique within an article and use the same lowercase/hyphen convention as filenames. A section can contain several paragraphs. The supported Markdown subset is paragraphs, headings (`#` through `######`, rendered at level 2 or below), **bold**, *italic*, inline code, `- ` bullet lists, and `> ` blockquotes. Separate blocks with blank lines. Raw HTML is displayed as text; links and other Markdown features are not currently interpreted.

Wrap the most important wording in `==double equals==`. Selecting a connected map component gives that wording strong lime highlighting; the remaining wording in its sections gets pale lime highlighting. Without `==...==`, a connected section has only the pale grade. The markers do not appear on the website.

## Draw the map and connect it to the text

The map uses ordinary SVG coordinates, with `(0, 0)` at the top left, x increasing to the right and y downward. `viewBox="0 0 460 680"` defines a 460-by-680 drawing area, scaled to the map column.

Each direct child of the SVG must be a component `<g>` with:

- `id`: a unique component name.
- `aria-label`: a readable name for keyboard and screen-reader users.
- `data-passages`: one or more text section names separated by spaces. Every name must match a passage marker in this file. Multiple components may refer to the same section.
- Optional `data-outline="true"`: selecting this component colors its outline lime instead of filling it. Useful for a surrounding ring.
- Optional `transform="translate(x y)"`: move the component's geometry.

Inside a component, use `polygon`, `polyline`, `circle`, `path`, `line` or `rect` geometry. A component may contain multiple shapes; they select together. Nested groups, scripts, external assets and arbitrary SVG elements are not supported. The builder supplies styling, generous click targets, keyboard controls and unique DOM IDs automatically. Optional stroke widths, line joins/caps and fills can be written on geometry. See the example article for polygons, circles, star paths and translated components.

Click a component or focus it and press Enter/Space to select it; click again or press Escape to clear. All its referenced sections highlight, and the prose scrolls to the first one listed. Clicking BNITZ returns to the list.

The build reports malformed metadata, duplicate section/component IDs, unsupported SVG and broken references with the source filename. Fix the reported file and rebuild; invalid articles do not replace the previous output.

## Publish

Build first, then serve or upload the contents of `interface/dist/` to any static web host. No backend is required. For the existing Sites deployment, preserve `interface/.openai/hosting.json`: it identifies the current site and its `interface/dist` output directory. Publish the `interface/` project through Sites after rebuilding; changing local files alone does not update the hosted site.

## Check the article pipeline

```sh
python3 -m unittest discover -s interface/tests
```
