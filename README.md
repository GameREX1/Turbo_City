# Turbo City by GameRAX

Turbo City is a browser-playable 3D arcade driving game built with Three.js and designed for GitHub Pages.

## Play

Open **https://turbocity.gamerax.online**, choose a car and a drive mode, then select **Start Driving**.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Accelerate | W / Up Arrow | Gas |
| Brake / reverse | S / Down Arrow | Brake |
| Steer | A / D or Left / Right | Left / right |
| Recover car | R | — |
| Change camera | C | Camera button |
| Pause / resume | Escape / Enter | Pause button |
| Fullscreen | — | Fullscreen button |

Space also applies the brake.

## Drive modes

- **Free Roam:** explore the city and collect stars.
- **City Sprint:** pass through the checkpoint gates and complete the city route.
- **Skill Course:** follow the checkpoint route and navigate the marked cone course. Cones reset when the course is started again.

## Current game features

- Third-person and close camera views.
- Four selectable RAX car trims with different paint colours and handling/top-speed tuning.
- Detailed glTF sports-car model with a built-in procedural fallback if the model asset cannot load.
- Reflective paint, sky lighting, fog, shadows and restrained bloom.
- Procedural city buildings with instanced window lighting, textured roads, lane markings, zebra crossings, sidewalks, parks, trees, street furniture and moving traffic.
- Collectible stars, checkpoint timing, score, distance display and a minimap.
- Keyboard and mobile touch controls.

## Run locally

The game uses JavaScript modules. Start a local web server instead of opening the HTML file directly:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Publish with GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. The custom domain is stored in the repository's `CNAME` file.

## Technical notes and asset credit

GitHub Pages serves the browser build; it does not execute C++ or Unity C# source files. This version uses Three.js so it can run as a static web game.

The vehicle model is the Ferrari 458 Italia model credited by the Three.js car-materials example to **vicent091036** on Sketchfab: [model page](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6). It is recoloured for the fictional RAX car trims in this game. The Three.js example demonstrates loading the model and its named body, glass, rim and wheel meshes: [Three.js car materials example](https://threejs.org/examples/webgl_materials_car.html).

Three.js and its example loaders are loaded from jsDelivr. Google Fonts are loaded from Google Fonts. An internet connection is needed for the first load of these external resources and the optional vehicle model.
