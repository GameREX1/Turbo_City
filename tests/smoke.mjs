import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

const state = () => page.evaluate(() => window.__turboCityDebug?.());

try {
  await page.goto("http://127.0.0.1:4173/?ciDebug=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector("#start-button");
    return button && !button.disabled;
  }, { timeout: 40000 });

  assert.equal(await page.locator("#loading").isVisible(), false, "loading overlay should disappear");
  assert.ok(await page.locator("#game canvas").count(), "3D canvas should be created");

  // Check the garage selector before driving.
  const firstCar = await page.locator("#car-name").innerText();
  assert.equal(firstCar, "BUGATTI CHIRON", "garage should start with the light-blue Bugatti Chiron");
  assert.equal(await page.locator("#car-count").innerText(), "01 / 08", "garage should show eight selectable vehicles");
  const expectedGarageCars = [
    "BUGATTI CHIRON", "TOYOTA LAND CRUISER", "LAMBORGHINI AVENTADOR SVJ 63",
    "TOYOTA SUPRA MK4", "NISSAN GT-R R35", "FORD MUSTANG GT", "CHEVROLET CAMARO SS", "SPECTRAL GT RS"
  ];
  for (const expectedName of expectedGarageCars) {
    assert.equal(await page.locator("#car-name").innerText(), expectedName, "garage should select " + expectedName);
    if (expectedName === "SPECTRAL GT RS") {
      await page.waitForFunction(
        () => window.__turboCityDebug?.().playerModel === "TurboCity_Spectral_GT_RS",
        null,
        { timeout: 15000, polling: 200 }
      ).catch(() => {});
      console.log("DETAILED VEHICLE ASSET TRACE:", await state());
    }
    await page.locator("#next-car").click();
  }
  assert.equal(await page.locator("#car-name").innerText(), "BUGATTI CHIRON", "garage should cycle back to the first car");
  await page.locator("#next-car").click();
  const secondCar = await page.locator("#car-name").innerText();
  assert.notEqual(firstCar, secondCar, "next-car button should change the selected car");
  await page.locator("#prev-car").click();
  assert.equal(await page.locator("#car-name").innerText(), firstCar, "previous-car button should restore the first car");

  await page.locator("#quality-select").selectOption("performance");
  assert.equal(await page.locator("#quality-select").inputValue(), "performance", "Performance quality should be selectable");
  await page.locator("#quality-select").selectOption("balanced");
  assert.equal(await page.locator("#quality-select").inputValue(), "balanced", "Balanced quality should be selectable");

  await page.locator("#start-button").click();
  assert.equal(await page.locator("#hud").isVisible(), true, "HUD should appear after starting");

  const start = await state();

  // Drive forward and verify both speed and world position change.
  await page.keyboard.down("w");
  await page.waitForFunction(() => Number(document.querySelector("#speed")?.innerText || 0) > 5, null, { timeout: 8000, polling: 100 });
  await page.waitForFunction((startZ) => {
    const pose=window.__turboCityDebug?.().position;
    return pose && pose.z < startZ - 1;
  }, start.position.z, { timeout: 8000, polling: 100 });
  await page.keyboard.up("w");
  const forward = await state();
  const forwardSpeed = Number(await page.locator("#speed").innerText());
  console.log("FORWARD POSITION TRACE:", {start:start.position,after:forward.position,velocity:forward.velocity,speed:forwardSpeed,physicsTicks:forward.physicsTicks,frameCount:forward.frameCount,lastFrameDt:forward.lastFrameDt,pageErrors:[...pageErrors]});
  assert.ok(forwardSpeed > 5, "W should accelerate; got " + forwardSpeed + " km/h");
  assert.ok(forward.position.z < start.position.z - 1, "W should move the car forward along the road");

  // Brake to a stop. Space must never put the gearbox into reverse.
  await page.keyboard.down("Space");
  await page.waitForTimeout(1250);
  await page.keyboard.up("Space");
  const braked = await state();
  console.log("BRAKE TRACE:", { before:forward.forwardSpeed.toFixed(2), after:braked.forwardSpeed.toFixed(2), speedKmh:await page.locator("#speed").innerText() });
  assert.ok(Math.abs(braked.forwardSpeed) < 0.8, "Space should bring the car close to a stop; residual speed " + braked.forwardSpeed);
  assert.notEqual(await page.locator("#gear").innerText(), "R", "Space must not engage reverse");

  // Reverse should keep accelerating backwards after crossing zero.
  const reverseStart = (await state()).position.z;
  await page.keyboard.down("s");
  await page.waitForTimeout(1400);
  await page.keyboard.up("s");
  const reversed = await state();
  assert.ok(reversed.forwardSpeed < -1.2, "S should accelerate in reverse; speed was " + reversed.forwardSpeed);
  assert.ok(reversed.position.z > reverseStart + 1, "reverse should move the car backwards");
  assert.equal(await page.locator("#gear").innerText(), "R", "reverse gear indicator should show R");

  // Re-accelerate, steer and verify the car's actual heading changes.
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  const headingBefore = (await state()).yaw;
  await page.keyboard.down("a");
  await page.waitForTimeout(950);
  await page.keyboard.up("a");
  const afterLeft = await state();
  assert.ok(Math.abs(afterLeft.yaw - headingBefore) > 0.12, "A should rotate the car's heading");
  assert.ok(Math.abs(afterLeft.playerYaw + afterLeft.yaw) < 1e-6, "visual car body must rotate in the same direction as its physics heading");
  const leftTurnX = afterLeft.position.x;

  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(950);
  await page.keyboard.up("d");
  const afterRight = await state();
  assert.ok(Number.isFinite(afterRight.yaw), "right steering should keep a valid heading");
  assert.ok(Math.abs(afterRight.position.x - leftTurnX) > 0.15, "steering should affect the car's world position");

  // Camera and pause/resume.
  await page.locator("#camera-button").click();
  assert.match(await page.locator("#camera-button").innerText(), /FAR CHASE/);
  await page.keyboard.press("c");
  assert.match(await page.locator("#camera-button").innerText(), /HOOD CAM/);

  await page.locator("#pause-button").click();
  assert.equal((await state()).paused, true, "pause button should pause the simulation");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  assert.equal((await state()).paused, false, "Enter should resume the simulation");

  // Recovery should zero velocity and keep the car upright at a recent safe pose.
  await page.keyboard.press("r");
  await page.waitForTimeout(80);
  const recovered = await state();
  assert.ok(Math.hypot(recovered.velocity.x, recovered.velocity.z) < 0.05, "R should stop the car");
  assert.equal(await page.locator("#speed").innerText(), "000", "recovery should reset speed");

  // Check mobile touch layout and all five drive controls.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("#touch-controls").isVisible(), true, "mobile controls should be visible");
  for (const action of ["left", "right", "gas", "brake", "reverse"]) {
    assert.equal(await page.locator('[data-action="' + action + '"]').count(), 1, "mobile " + action + " button should exist");
  }
  const gas = await page.locator('[data-action="gas"]').boundingBox();
  assert.ok(gas, "mobile gas button should have a hit area");
  await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  const mobileDrive = await state();
  assert.ok(mobileDrive.forwardSpeed > 0.5, "mobile gas button should accelerate");

  // Run a clean, independent high-speed test session so earlier collisions
  // or recovery positions cannot affect the 270+ km/h steering measurement.
  const highSpeedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const highSpeedErrors = [];
  highSpeedPage.on("pageerror", error => highSpeedErrors.push(error.message));
  await highSpeedPage.goto("http://127.0.0.1:4173/?ciDebug=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await highSpeedPage.waitForFunction(() => {
    const button = document.querySelector("#start-button");
    return button && !button.disabled;
  }, { timeout: 40000 });
  await highSpeedPage.locator("#start-button").click();
  const highSpeedState = () => highSpeedPage.evaluate(() => window.__turboCityDebug?.());
  await highSpeedPage.evaluate(() => window.__turboCityPrepareHighSpeed?.());
  await highSpeedPage.keyboard.down("w");
  try {
    await highSpeedPage.waitForFunction(
      () => Number(document.querySelector("#speed")?.innerText || 0) >= 270,
      null,
      { timeout: 12000, polling: 100 }
    );
  } catch (error) {
    console.log("HIGH SPEED REACH TRACE:", await highSpeedState());
    throw error;
  }
  const highSpeedStart = await highSpeedState();
  await highSpeedPage.keyboard.down("a");
  await highSpeedPage.waitForTimeout(900);
  await highSpeedPage.keyboard.up("a");
  const highSpeedLeft = await highSpeedState();
  assert.ok(highSpeedLeft.forwardSpeed > 65, "car should remain at high speed during left turn");
  assert.ok(highSpeedLeft.yaw < highSpeedStart.yaw - 0.12, "A should turn physics heading left at 270+ km/h");
  assert.ok(Math.abs(highSpeedLeft.playerYaw + highSpeedLeft.yaw) < 1e-6, "visible car body must face the same direction as its physics heading on left turn");

  await highSpeedPage.keyboard.down("d");
  await highSpeedPage.waitForTimeout(900);
  await highSpeedPage.keyboard.up("d");
  await highSpeedPage.keyboard.up("w");
  const highSpeedRight = await highSpeedState();
  assert.ok(highSpeedRight.yaw > highSpeedLeft.yaw + 0.12, "D should turn physics heading right at 270+ km/h");
  assert.ok(Math.abs(highSpeedRight.playerYaw + highSpeedRight.yaw) < 1e-6, "visible car body must face the same direction as its physics heading on right turn");
  const cameraOffsetX = highSpeedRight.cameraPosition.x - highSpeedRight.position.x;
  const cameraOffsetZ = highSpeedRight.cameraPosition.z - highSpeedRight.position.z;
  const cameraOffsetLength = Math.hypot(cameraOffsetX, cameraOffsetZ);
  const expectedCameraX = -Math.sin(highSpeedRight.yaw);
  const expectedCameraZ = Math.cos(highSpeedRight.yaw);
  const cameraAlignment = (cameraOffsetX * expectedCameraX + cameraOffsetZ * expectedCameraZ) / cameraOffsetLength;
  assert.ok(cameraAlignment > 0.8, "chase camera should remain behind the car after high-speed turns; alignment " + cameraAlignment);
  assert.deepEqual(highSpeedErrors, [], "high-speed browser errors: " + highSpeedErrors.join(" | "));
  console.log("HIGH-SPEED STEERING TRACE:", {
    speedKmh: Math.round(highSpeedRight.forwardSpeed * 3.6),
    leftYawDelta: (highSpeedLeft.yaw - highSpeedStart.yaw).toFixed(3),
    rightYawDelta: (highSpeedRight.yaw - highSpeedLeft.yaw).toFixed(3),
    bodyHeadingMatches: Math.abs(highSpeedRight.playerYaw + highSpeedRight.yaw) < 1e-6,
    cameraAlignment: cameraAlignment.toFixed(3)
  });
  await highSpeedPage.close();

  assert.deepEqual(pageErrors, [], "browser runtime errors: " + pageErrors.join(" | "));
  console.log("PASS: garage selector, quality presets, forward driving, brake, reverse movement, steering/heading, camera, pause/resume, recovery and mobile controls");
  console.log("DRIVE TRACE:", {
    forwardKmh: forwardSpeed,
    reverseMps: reversed.forwardSpeed.toFixed(2),
    leftHeadingChange: (afterLeft.yaw - headingBefore).toFixed(2),
    xAfterRight: afterRight.position.x.toFixed(2),
    mobileForwardMps: mobileDrive.forwardSpeed.toFixed(2)
  });

  // Separate low-resolution render check: unlike ciDebug, ciVisual draws frames.
  await page.close();
  const visualPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const visualErrors = [];
  visualPage.on("pageerror", error => visualErrors.push(error.message));
  await visualPage.goto("http://127.0.0.1:4173/?ciVisual=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await visualPage.waitForFunction(() => {
    const button = document.querySelector("#start-button");
    return button && !button.disabled;
  }, { timeout: 40000 });
  const visualStart = await visualPage.evaluate(() => window.__turboCityDebug?.());
  await visualPage.locator("#start-button").click();
  await visualPage.waitForTimeout(1500);
  const visualEnd = await visualPage.evaluate(() => window.__turboCityDebug?.());
  const visualFps = (visualEnd.frameCount - visualStart.frameCount) / 1.5;
  assert.ok(visualEnd.renderInfo.calls > 0, "visual test should render draw calls");
  assert.ok(visualEnd.renderInfo.triangles > 0, "visual test should render triangles");
  assert.ok(visualFps >= 7.5, "low-resolution render loop should stay above the 7.5 FPS software-renderer floor; got " + visualFps.toFixed(1));
  assert.deepEqual(visualErrors, [], "visual render errors: " + visualErrors.join(" | "));
  console.log("VISUAL RENDER TRACE:", {
    approxFps: visualFps.toFixed(1),
    drawCalls: visualEnd.renderInfo.calls,
    triangles: visualEnd.renderInfo.triangles,
    testPixelRatio: visualEnd.renderInfo.pixelRatio
  });
} finally {
  await browser.close();
}