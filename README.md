# BNITZ

The layout of ideas.

## Run the composer locally

Requires Python 3.9 or newer. From the repository root:

```sh
python3 interface/serve.py composer
```

Open [the composer](http://127.0.0.1:4174).

Build maps from fixed forms, moving and scaling them in dot-grid steps without freehand drawing.

Type a decimal in **Size**, such as **2.5**, for a precise size in grid units. Proportions stay fixed.

Set **X** and **Y** for an exact position in canvas units, measured from the shape’s upper-left corner before rotation. Decimals are allowed. Dragging and arrow keys still snap to the grid.

Circle centers stay aligned to the dots when moved or resized with grid controls.

Select a shape and set **Highlight** to **Full shape** or **Outline only** to choose whether its interior or just its perimeter turns lime.

Copy and paste a selected shape with **Ctrl/Cmd+C** and **Ctrl/Cmd+V**. Each paste creates a separate shape with the same appearance and text connections.

Add a **Triangle**, then choose **Default triangle**, **Right triangle**, or **Wide triangle** in its **Variant** setting. The wide triangle joins the outline of two right triangles into one shape.

The optional **Source** link appears beside the author and year in the reader.

For lines and curves, **Appearance → Line style** also offers **Zigzag** and **Asterisk ends**.

Select quoted paragraphs and click **Citation block**. Use **Normal text** to remove the formatting. Citations support the same map highlights as the rest of the article.

## Export an article to the codebase

Click **Export to library** in the composer. It saves the article into this repository and rebuilds the reader automatically.

## Run the reader locally

In another terminal, from the repository root:

```sh
python3 interface/serve.py reader
```

Open [the reader](http://127.0.0.1:4173). Pick an article, then click its map shapes to highlight the connected text.

Leave both terminals running while composing and reading. Stop either server with Ctrl-C.
