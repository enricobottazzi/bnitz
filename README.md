# BNITZ

The structure of ideas.

## Run the composer locally

Requires Python 3.9 or newer. From the repository root:

```sh
python3 interface/serve.py composer
```

Open [the composer](http://127.0.0.1:4174). Enter the title, author and year, then paste the article text.

Draw the map using ellipses, triangles, polygons, stars, lines, curves and freehand strokes. Select a shape to customize it or use **Delete shape** to remove it; **Undo** restores it. To connect a shape to the article, select the relevant text and choose **Strong highlight** or **Soft highlight**. Repeat to connect more passages to the same shape.

Use **Open article** to edit an existing reading. **Download article** saves a portable copy; **Import file** opens one again.

## Export an article to the codebase

Click **Export to library** in the composer. It saves the article into this repository and rebuilds the reader automatically. An article opened from the library is updated when you export it again.

Refresh the reader to see the exported article. No files need to be written or edited by hand.

## Run the reader locally

In another terminal, from the repository root:

```sh
python3 interface/serve.py reader
```

Open [the reader](http://127.0.0.1:4173). Pick an article, then click its map shapes to highlight the connected text.

Leave both terminals running while composing and reading. Stop either server with Ctrl-C.
