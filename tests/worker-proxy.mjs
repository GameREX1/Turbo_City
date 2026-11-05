import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../workers/tokyo-map-proxy.js", import.meta.url), "utf8");
const instrumented = source
  .replace("export default {", "globalThis.__tokyoProxy = {")
  + "\nglobalThis.__resolveTokyoAsset = resolveAsset;";

await import("data:text/javascript;base64," + Buffer.from(instrumented).toString("base64"));

const resolveAsset = globalThis.__resolveTokyoAsset;
const worker = globalThis.__tokyoProxy;

const city = resolveAsset("/tokyo-city.glb");
assert.equal(city?.contentType, "model/gltf-binary");
assert.match(city?.url || "", /Tokyo_Takeshiba_PLATEAU_GameReady_Free\\.glb$/);

const originalTexturePath = resolveAsset("/textures/tokyo_ground_albido_2k.png");
assert.equal(originalTexturePath?.contentType, "image/png");
assert.match(originalTexturePath?.url || "", /Tokyo_Ground_Albedo_2K\\.png$/);

const textureAlias = resolveAsset("/tokyo_ground_albedo_2k.png");
assert.equal(textureAlias?.contentType, "image/png");

assert.equal(resolveAsset("/textures/missing-building-texture.png"), null);
assert.equal(resolveAsset("/random-file.bin"), null);

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => new Response("asset-bytes", {
  status: 200,
  headers: { "Content-Length": "12", "Accept-Ranges": "bytes" }
});

try {
  const cityResponse = await worker.fetch(new Request("https://worker.test/tokyo-city.glb", {
    method: "GET",
    headers: { Origin: "https://turbocity.gamerax.online" }
  }));
  assert.equal(cityResponse.status, 200);
  assert.equal(cityResponse.headers.get("Content-Type"), "model/gltf-binary");
  assert.equal(cityResponse.headers.get("Access-Control-Allow-Origin"), "https://turbocity.gamerax.online");

  const textureResponse = await worker.fetch(new Request("https://worker.test/textures/tokyo_ground_albido_2k.png", {
    method: "GET",
    headers: { Origin: "https://turbocity.gamerax.online" }
  }));
  assert.equal(textureResponse.status, 200);
  assert.equal(textureResponse.headers.get("Content-Type"), "image/png");

  const missingResponse = await worker.fetch(new Request("https://worker.test/textures/missing.png"));
  assert.equal(missingResponse.status, 404);
} finally {
  globalThis.fetch = realFetch;
}

console.log("PASS: Tokyo GLB route, external albedo texture route, CORS headers and unknown-asset rejection");
