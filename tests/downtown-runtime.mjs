import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto("http://127.0.0.1:4173/?ciDowntown=1", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForFunction(() => {
    const button = document.querySelector("#start-button");
    const state = window.__turboCityDebug?.();
    return button && !button.disabled && state?.downtownCityLoaded === true;
  }, { timeout: 120000, polling: 250 });

  const loaded = await page.evaluate(() => window.__turboCityDebug());
  assert.equal(loaded.downtownStats?.originalPlacements, 118, "original Downtown block should load");
  assert.equal(loaded.downtownStats?.districtTiles, 25, "the driving district should use a connected 5x5 layout");
  assert.equal(loaded.downtownStats?.totalPlacements, 2950, "all 2,950 map placements should be instanced");
  assert.equal(loaded.downtownStats?.modelCount, 24, "all 24 modular models should load");
  assert.ok(loaded.downtownStats?.instancedMeshCount > 0, "the map should render instanced meshes");
  assert.ok(loaded.downtownBuildingColliders >= 250, "building collision bounds should be created");
  assert.equal(loaded.cityLimit, 232, "driving limits should match the Downtown map size");

  await page.locator("#start-button").click();
  await page.waitForFunction(() => document.querySelector("#hud")?.style.display === "block", {
    timeout: 10000
  });
  const start = await page.evaluate(() => window.__turboCityDebug());
  assert.ok(Math.abs(start.position.x - (-28)) < 0.1, "Bugatti should spawn at the planned road position");
  assert.ok(Math.abs(start.position.z) < 0.1, "Bugatti should spawn on the main road centreline");
  assert.ok(Math.abs(start.yaw - Math.PI / 2) < 0.02, "Bugatti should face along the open eastbound road");

  await page.keyboard.down("w");
  await page.waitForTimeout(850);
  await page.keyboard.up("w");
  const driven = await page.evaluate(() => window.__turboCityDebug());
  assert.ok(driven.position.x > start.position.x + 1, "the car should drive forward along the Downtown road");
  assert.ok(driven.forwardSpeed > 1, "the existing driving physics should accelerate on the new map");
  assert.deepEqual(pageErrors, [], "Downtown runtime errors: " + pageErrors.join(" | "));

  console.log("PASS: Downtown runtime loaded; 5x5 district, 24 models, 2,950 placements, spawn, collisions and driving verified.");
} finally {
  await browser.close();
}
