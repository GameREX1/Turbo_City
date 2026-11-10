const OWNER = "GameREX1";
const REPOSITORY = "Turbo-City-Assets";
const REF = "main";
const ALLOWED_ORIGINS = new Set([
  "https://turbocity.gamerax.online",
  "https://turbo-city.uk7186979.workers.dev"
]);

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Vary": "Origin"
  };
}

function allowedAssetPath(path) {
  if (!path || path.length > 240 || path.includes("\\") || path.split("/").some(part => part === "." || part === "..")) {
    return false;
  }

  const extensionAllowed = /\.(gltf|bin|jpg|jpeg|png)$/i.test(path);
  if (!extensionAllowed) return false;

  return (
    /^models\/(buildings|roads|props)\/[a-z0-9_-]+\.(gltf|bin)$/i.test(path) ||
    /^scenes\/sample_block\.(gltf|bin)$/i.test(path) ||
    /^textures\/[a-z0-9_-]+\.(jpg|jpeg|png)$/i.test(path)
  );
}

function contentType(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "gltf") return "model/gltf+json; charset=utf-8";
  if (ext === "bin") return "application/octet-stream";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, tokenConfigured: Boolean(env.GITHUB_TOKEN) }, 200, headers);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: "Worker secret GITHUB_TOKEN is not configured." }, 503, headers);
    }

    if (!url.pathname.startsWith("/assets/")) {
      return new Response("Not found", { status: 404, headers });
    }

    let assetPath;
    try {
      assetPath = decodeURIComponent(url.pathname.slice("/assets/".length));
    } catch {
      return new Response("Invalid asset path", { status: 400, headers });
    }

    if (!allowedAssetPath(assetPath)) {
      return new Response("Asset path is not allowed", { status: 404, headers });
    }

    const apiPath = assetPath.split("/").map(encodeURIComponent).join("/");
    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/${apiPath}?ref=${REF}`;
    const upstreamHeaders = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GameRAX-Turbo-City-Asset-Worker"
    };
    const range = request.headers.get("Range");
    if (range) upstreamHeaders.Range = range;

    let upstream;
    try {
      upstream = await fetch(apiUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow"
      });
    } catch {
      return new Response("Could not reach the private asset repository", { status: 502, headers });
    }

    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : 502;
      return new Response(status === 404 ? "Asset not found" : "Private asset repository request failed", {
        status,
        headers: { ...headers, "Cache-Control": "no-store" }
      });
    }

    const responseHeaders = {
      ...headers,
      "Content-Type": contentType(assetPath),
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": upstream.headers.get("Accept-Ranges") || "bytes"
    };
    const contentLength = upstream.headers.get("Content-Length");
    const contentRange = upstream.headers.get("Content-Range");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  }
};
