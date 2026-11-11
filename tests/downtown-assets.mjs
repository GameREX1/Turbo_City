import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "assets", "downtown");
const layoutPath = path.join(assetRoot, "layout.json");
assert.ok(existsSync(layoutPath), "Downtown layout manifest must be present");

const layout = JSON.parse(readFileSync(layoutPath, "utf8"));
assert.equal(layout.instances.length, 118, "the original sample block must retain all 118 placements");
const modelPaths = [...new Set(layout.instances.map(item => item.asset))];
assert.equal(modelPaths.length, 24, "all 24 source models used by the sample block must be present");

let checkedBuffers = 0;
let checkedTextures = new Set();
for (const relativeModelPath of modelPaths) {
  const modelPath = path.join(assetRoot, relativeModelPath);
  assert.ok(existsSync(modelPath), "Missing model: " + relativeModelPath);
  const model = JSON.parse(readFileSync(modelPath, "utf8"));
  for (const buffer of model.buffers || []) {
    const resolved = path.resolve(path.dirname(modelPath), buffer.uri);
    assert.ok(resolved.startsWith(assetRoot + path.sep), "Buffer escapes the Downtown asset folder");
    assert.ok(existsSync(resolved), "Missing glTF buffer: " + relativeModelPath + " -> " + buffer.uri);
    assert.ok(statSync(resolved).size >= buffer.byteLength, "glTF buffer is shorter than byteLength: " + resolved);
    checkedBuffers++;
  }
  for (const image of model.images || []) {
    const resolved = path.resolve(path.dirname(modelPath), image.uri);
    assert.ok(resolved.startsWith(assetRoot + path.sep), "Texture escapes the Downtown asset folder");
    assert.ok(existsSync(resolved), "Missing glTF texture: " + relativeModelPath + " -> " + image.uri);
    checkedTextures.add(path.relative(assetRoot, resolved).replaceAll(path.sep, "/"));
  }
}
assert.equal(checkedBuffers, 24, "each glTF model must have its external binary buffer");
assert.equal(checkedTextures.size, 31, "all 31 source PBR textures must be reachable");

const game = readFileSync(path.join(root, "game.js"), "utf8");
assert.match(game, /loadDowntownCity/ , "the game must import the Downtown loader");
assert.match(game, /LOADING DOWNTOWN CITY MAP/, "the garage must identify the new map loader");

console.log("PASS: Downtown layout, 24 glTF models, 24 binary buffers and " +
  checkedTextures.size + " textures are present and linked.");
