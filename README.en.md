# CoDesign

CoDesign is a local infinite-canvas plugin for Codex. It brings a tldraw-powered canvas into Codex for visual thinking, annotation, image generation, and annotation-driven image edits. The canvas runs as a local web service, and its data is saved in the active user project under `canvas/` instead of inside the plugin repository.

中文说明: [README.md](README.md)

## Features

- Open a local tldraw infinite canvas from Codex.
- Persist canvas pages and image assets in the active project directory.
- Create AI image holders on the canvas and ask Codex to generate images into the selected holder.
- Provide CoDesign annotation screenshots and let Codex generate clean revised images beside the original.
- Use CoDesign MCP tools to read selection state, insert images, and save page-local assets.

## Installation

### Ask Codex To Install It

Send the following message to Codex:

```text
Please install the CoDesign Codex plugin from https://github.com/<your-username>/CoDesign.git.
Clone the repository into ~/plugins/codesign, verify that .codex-plugin/plugin.json exists,
add the plugin to the personal marketplace, then run codex plugin add codesign@personal.
After installing, validate the plugin and tell me whether I should start a new conversation to load the new skills and MCP tools.
```

### Manual Install

Clone the plugin into the default location referenced by the Codex personal marketplace:

```bash
mkdir -p ~/plugins
git clone https://github.com/<your-username>/CoDesign.git ~/plugins/codesign
cd ~/plugins/codesign
npm install
npm run build
```

Make sure `~/.agents/plugins/marketplace.json` contains a CoDesign entry:

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "codesign",
      "source": {
        "source": "local",
        "path": "./plugins/codesign"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Then install the plugin:

```bash
codex plugin add codesign@personal
```

After installing, start a new Codex conversation so the new skills and MCP tools are loaded cleanly.

## Usage

### Open The Canvas

Ask Codex:

```text
Open the CoDesign canvas for this project.
```

CoDesign starts a local service at:

```text
http://127.0.0.1:43217/
```

Canvas data is saved in the active project:

```text
canvas/pages/<page-id>/codesign-canvas.json
canvas/pages/<page-id>/assets/
```

![Open CoDesign canvas in Codex](assets/open-canvas.png)

### Generate A New Image

1. Open the CoDesign canvas.
2. Create and select an AI image holder on the canvas.
3. Describe the image you want Codex to generate, for example:

```text
Generate a new image into the selected CoDesign AI image holder.
```

Codex reads the selected holder, matches its aspect ratio, generates the image, and inserts it into the holder.

![Generate and insert a new image with CoDesign](assets/generate-image.png)

### Generate From An Annotation Screenshot

1. Annotate an image on the CoDesign canvas.
2. Take a screenshot of the annotated image and send it to Codex.
3. Use this prompt:

```text
Use my CoDesign annotation screenshot to generate a clean revised image beside the original.
```

Codex reads the notes and arrows in the screenshot, generates a clean revised image without annotation artifacts, and places it beside the original. The original image and annotations are not deleted or moved.

![Generate a revised image from a CoDesign annotation screenshot](assets/annotation-edit.png)

## Skills

- `codesign:codesign-open-canvas`: open the local CoDesign canvas.
- `codesign:codesign-imgae-gen`: insert a generated image into the selected AI image holder.
- `codesign:codesign-image-edit`: generate a revised image from a user-provided CoDesign annotation screenshot.

## Local Development

```bash
npm install
npm run dev
npm run build
```

You can also start the canvas service directly and pass the active user project directory:

```bash
./scripts/start-canvas.sh /path/to/user/project
```

Useful environment variables:

- `CODESIGN_PORT`: local service port, default `43217`.
- `CODESIGN_PROJECT_DIR`: the user project directory that owns the canvas data.
- `CODESIGN_CANVAS_DIR`: canvas data directory, default `$CODESIGN_PROJECT_DIR/canvas`.

## Developer

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

## Acknowledgements

CoDesign's canvas experience is built on top of [tldraw/tldraw](https://github.com/tldraw/tldraw).
