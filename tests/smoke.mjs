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
  await page.goto("http://127.0.0.1:4173/?ciDebug=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector("#start-button");
    return button && !button.disabled;
  }, { timeout: 40000 });

  assert.equal(await page.locator("#loading").isVisible(), false, "loading overlay should disappear");
  assert.ok(await page.locator("#game canvas").count(), "Three.js canvas should be created");

  await page.locator("#start-button").click();
  assert.equal(await page.locator("#hud").isVisible(), true, "HUD should appear after starting");

  // Keyboard acceleration.
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  console.log("DEBUG while W held:", await page.evaluate(() => window.__turboCityDebug?.()));
  await page.waitForTimeout(1000);
  console.log("DEBUG after W hold:", await page.evaluate(() => window.__turboCityDebug?.()));
  await page.keyboard.up("w");
  const accelerated = Number(await page.locator("#speed").innerText());
  assert.ok(accelerated > 5, "W should accelerate the car; got " + accelerated + " km/h");

  // Space must brake without engaging reverse.
  await page.keyboard.down("Space");
  await page.waitForTimeout(120);
  console.log("DEBUG while Space held:", await page.evaluate(() => window.__turboCityDebug?.()));
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  const braked = Number(await page.locator("#speed").innerText());
  console.log("DEBUG after Space released:", await page.evaluate(() => window.__turboCityDebug?.()));
  assert.ok(braked < accelerated, "Space should reduce speed (" + accelerated + " -> " + braked + ")");
  assert.notEqual(await page.locator("#gear").innerText(), "R", "Space must not select reverse");

  // S should slow forward travel and then engage reverse.
  await page.keyboard.down("s");
  await page.waitForTimeout(250);
  console.log("DEBUG while S held:", await page.evaluate(() => window.__turboCityDebug?.()));
  await page.waitForTimeout(1650);
  console.log("DEBUG after S hold:", await page.evaluate(() => window.__turboCityDebug?.()));
  await page.keyboard.up("s");
  assert.equal(await page.locator("#gear").innerText(), "R", "S should engage reverse after stopping");

  // Steering, camera cycling, pause and recovery should not throw.
  await page.keyboard.down("a");
  await page.waitForTimeout(250);
  await page.keyboard.up("a");
  await page.locator("#camera-button").click();
  assert.match(await page.locator("#camera-button").innerText(), /FAR CHASE/);
  await page.keyboard.press("c");
  assert.match(await page.locator("#camera-button").innerText(), /HOOD CAM/);

  await page.locator("#pause-button").click();
  assert.equal(await page.locator("#pause-screen").isVisible(), true, "pause button should pause");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#pause-screen").isVisible(), false, "Enter should resume");

  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(await page.locator("#speed").innerText(), "000", "R should recover and stop the car");

  // Mobile buttons: gas, brake and reverse must be present and clickable.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("#touch-controls").isVisible(), true, "mobile controls should appear");
  for (const action of ["left", "right", "gas", "brake", "reverse"]) {
    assert.equal(await page.locator('[data-action="' + action + '"]').count(), 1, "mobile " + action + " control should exist");
  }
  const gas = await page.locator('[data-action="gas"]').boundingBox();
  assert.ok(gas, "mobile gas button should have a visible hit area");
  await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  assert.ok(Number(await page.locator("#speed").innerText()) > 0, "mobile gas should accelerate");

  assert.deepEqual(pageErrors, [], "browser runtime errors: " + pageErrors.join(" | "));
  console.log("PASS: startup, keyboard acceleration, brake, reverse, steering, camera, pause/resume, recovery and mobile controls");
} finally {
  await browser.close();
}