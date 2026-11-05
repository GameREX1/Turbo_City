const CITY_ASSET_URL = "https://github.com/GameREX1/Turbo_City/releases/download/tokyo-city-v1/Tokyo_Takeshiba_PLATEAU_GameReady_Free.glb";
const GROUND_TEXTURE_URL = "https://github.com/GameREX1/Turbo_City/releases/download/tokyo-city-v1/Tokyo_Ground_Albedo_2K.png";
const ALLOWED_ORIGIN = "https://turbocity.gamerax.online";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Vary": "Origin"
  };
}

function resolveAsset(pathname) {
  const path = decodeURIComponent(pathname || "/").toLowerCase();
  if (path === "/" || path.endsWith("/tokyo-city.glb") || path.endsWith("/tokyo_takeshiba_plateau_gameready_free.glb")) {
    return { url: CITY_ASSET_URL, contentType: "model/gltf-binary", cacheTtl: 86400 };
  }

  // GLTFLoader resolves external image URIs relative to the GLB's Worker URL.
  // Map the original ground-albedo filename and its texture-folder variants
  // to the separately uploaded PNG release asset.
  if (path.includes("ground") && path.includes("alb") && path.endsWith(".png")) {
    return { url: GROUND_TEXTURE_URL, contentType: "image/png", cacheTtl: 86400 };
  }

  return null;
}

export default {
  async fetch(request) {
    const headers = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const asset = resolveAsset(new URL(request.url).pathname);
    if (!asset) {
      return new Response("Asset not found", { status: 404, headers });
    }

    const range = request.headers.get("Range");
    let upstream;

    try {
      upstream = await fetch(asset.url, {
        method: request.method,
        headers: range ? { "Range": range } : undefined,
        redirect: "follow",
        cf: range ? undefined : { cacheEverything: true, cacheTtl: asset.cacheTtl }
      });
    } catch (error) {
      return new Response("Could not reach the GitHub release asset", { status: 502, headers });
    }

    if (!upstream.ok) {
      return new Response("GitHub release asset returned HTTP " + upstream.status, { status: 502, headers });
    }

    headers["Content-Type"] = asset.contentType;
    headers["Cache-Control"] = range ? "public, max-age=3600" : "public, max-age=" + asset.cacheTtl;
    headers["Accept-Ranges"] = upstream.headers.get("Accept-Ranges") || "bytes";

    const contentLength = upstream.headers.get("Content-Length");
    const contentRange = upstream.headers.get("Content-Range");
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers
    });
  }
};
