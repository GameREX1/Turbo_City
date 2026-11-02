# Turbo City by GameRAX

A browser-playable 3D arcade driving prototype built with Three.js. It is designed to be hosted as a static site on GitHub Pages.

## Play

Open the deployed GitHub Pages URL, choose a car, and press **Start Driving**.

## Controls

- **W / Arrow Up** — accelerate
- **S / Arrow Down** — brake / reverse
- **A / D** or **Left / Right** — steer
- **Shift** — nitro (while accelerating)
- **Space** — handbrake / drift
- **R** — reset the car
- On touch devices, use the on-screen controls.

## Current prototype features

- Four selectable, original arcade-style supercars
- Procedurally generated city blocks, roads, plazas, trees, street lights and stunt ramps
- Third-person follow camera
- Acceleration, steering, braking, reverse, nitro, drift and jump handling
- Speedometer, gear indicator and nitro meter
- Keyboard and touch controls

## Run locally

Because the game uses JavaScript modules, run it from a local web server rather than opening the HTML file directly. For example, with Python installed:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Publish with GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then save. GitHub Pages will publish `index.html`.

## Technical note

GitHub Pages hosts browser files; it does not execute Unity C# projects. This first playable build uses Three.js so it can run directly in a browser without a Unity WebGL export. A native Unity/C# project and its WebGL export pipeline would be a separate build target.

The game uses the Three.js module from jsDelivr and Google Fonts, so the first load requires an internet connection.
