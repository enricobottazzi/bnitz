# BNITZ

The structure of ideas.

## Run the composer locally

Requires Python 3.9 or newer. From the repository root:

```sh
python3 interface/serve.py composer
```

Open [the composer](http://127.0.0.1:4174).

## Export an article to the codebase

Click **Export to library** in the composer. It saves the article into this repository and rebuilds the reader automatically.

## Run the reader locally

In another terminal, from the repository root:

```sh
python3 interface/serve.py reader
```

Open [the reader](http://127.0.0.1:4173). Pick an article, then click its map shapes to highlight the connected text.

Leave both terminals running while composing and reading. Stop either server with Ctrl-C.
