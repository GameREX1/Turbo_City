import assert from "node:assert/strict";
import { findTokyoRoadSpawn } from "../src/world/tokyo-spawn.js";

const bounds = { minX: -120, maxX: 120, minZ: -120, maxZ: 120 };
const buildings = [
  { x: 0, z: 0, w: 30, d: 30 },
  { x: -12, z: 0, w: 10, d: 210 },
  { x: 12, z: 0, w: 10, d: 210 },
  { x: 0, z: -112, w: 38, d: 12 },
  { x: 0, z: 112, w: 38, d: 12 }
];

const spawn = findTokyoRoadSpawn(buildings, bounds, {
  maxRadius: 65,
  gridStep: 5,
  maxForwardDistance: 85,
  minForwardDistance: 55,
  corridorHalfWidth: 4.2,
  vehicleClearance: 2.2
});

assert.ok(spawn, "a drivable road corridor should be found between the buildings");
assert.ok(spawn.clearDistance >= 55, "spawn should have a long clear road ahead");
assert.equal(spawn.x, 0, "road corridor should be centred between the buildings");
assert.equal(spawn.z, 0, "spawn should not be shifted into the blocked building area");
assert.equal(spawn.direction, "north", "car should face along the clear road corridor");
assert.ok(
  !buildings.some((building) =>
    Math.abs(spawn.x - building.x) < building.w * 0.5 + 2.2 &&
    Math.abs(spawn.z - building.z) < building.d * 0.5 + 2.2
  ),
  "spawn must not overlap any building collision box"
);

console.log("PASS: Tokyo spawn selection chooses a clear, forward-drivable street corridor");
