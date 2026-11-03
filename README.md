# Turbo City by GameRAX

A browser-playable 3D arcade driving game built with Three.js and published through GitHub Pages.

## Play

Open **https://turbocity.gamerax.online**, select a car, choose a drive mode and press **Start Driving**.

## Project structure

The project is split by feature so each system can be maintained independently.

```text
Turbo_City/
├── index.html
├── game.js                  # Main bootstrap and game loop
├── src/
│   ├── config/
│   │   ├── game.js          # Cars, road spacing and world limits
│   │   └── quality.js       # Performance / Balanced / Ultra profiles
│   ├── render/
│   │   └── (renderer setup is coordinated by game.js)
│   ├── vehicles/
│   │   └── car.js           # Player car model, materials, wheels and fallback
│   ├── world/
│   │   ├── roads.js         # Ground, asphalt, lanes and crossings
│   │   ├── buildings.js     # Buildings, windows, parks, trees and street furniture
│   │   ├── activities.js    # Skill course, checkpoints and collectible stars
│   │   └── traffic.js       # AI traffic car creation and movement
│   └── systems/
│       ├── controls.js      # Keyboard and touch input
│       ├── driving.js       # Acceleration, braking, reverse, steering and collisions
│       └── camera.js        # Chase cameras and minimap
├── tests/
│   └── smoke.mjs            # Automated browser driving tests
└── .github/workflows/
    └── validate.yml        # Syntax checks and browser tests
```

## Graphics quality

Choose a graphics profile in the garage before driving:

- **Performance** — lowest resolution scale; shadows and bloom disabled.
- **Balanced** — recommended default; native-ish resolution scale, shadows and bloom disabled.
- **Ultra** — higher resolution scale, dynamic shadows and bloom. This can be demanding on integrated graphics.

For laptops that stutter, start with **Performance**. Close other heavy browser tabs and keep the browser window at a sensible size.

The renderer uses reduced texture anisotropy, skips full-resolution bloom unless Ultra is selected, avoids static city shadow casters, and updates the minimap/audio less frequently.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Accelerate | W / Up Arrow | Gas |
| Brake | Space | Brake |
| Reverse | S / Down Arrow | REV |
| Steer | A / D or Left / Right | Left / right |
| Recover car | R | — |
| Change camera | C | Camera button |
| Pause / resume | Escape / Enter | Pause button |
| Fullscreen | — | Fullscreen button |

## Drive modes

- **Free Roam:** explore the city and collect stars.
- **City Sprint:** pass through checkpoint gates and complete the city route.
- **Skill Course:** follow the checkpoint route and avoid the cones.

## Run locally

The game uses JavaScript modules. Start a local web server instead of opening the HTML file directly:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Publish with GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. The custom domain is stored in the repository's `CNAME` file.

## Technical notes and asset credit

GitHub Pages hosts the browser build; it does not execute C++ or Unity C# source files. The game uses Three.js modules so it can run as a static browser game.

The imported sports-car model is loaded from the Three.js examples host; if it is unavailable, the local procedural car model is used instead. The vehicle model is credited by the Three.js car-materials example to **vicent091036** on Sketchfab: [model page](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6).

Three.js and its example loaders are loaded from jsDelivr. Google Fonts are loaded from Google Fonts. An internet connection is required for these external resources.
