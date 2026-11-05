const ASSET_URL = "https://github.com/GameREX1/Turbo_City/releases/download/tokyo-city-v1/Tokyo_Takeshiba_PLATEAU_GameReady_Free.glb";
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

export default {
  async fetch(request) {
    const headers = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const range = request.headers.get("Range");
    let upstream;

    try {
      upstream = await fetch(ASSET_URL, {
        method: request.method,
        headers: range ? { "Range": range } : undefined,
        redirect: "follow",
        // Cache the full city asset at Cloudflare's edge; do not cache byte ranges.
        cf: range ? undefined : { cacheEverything: true, cacheTtl: 86400 }
      });
    } catch (error) {
      return new Response("Could not reach the GitHub release asset", { status: 502, headers });
    }

    if (!upstream.ok) {
      return new Response("GitHub release asset returned HTTP " + upstream.status, { status: 502, headers });
    }

    headers["Content-Type"] = "model/gltf-binary";
    headers["Cache-Control"] = range ? "public, max-age=3600" : "public, max-age=86400";
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
