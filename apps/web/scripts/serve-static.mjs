import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serveHandler = require("serve-handler");
const distDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const configPath = path.join(distDirectory, "serve.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const existingRewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const handlerConfig = {
  ...config,
  public: distDirectory,
  rewrites: [
    ...existingRewrites,
    { source: "**", destination: "/index.html" },
  ],
};
const globalHeaderRule = (config.headers ?? []).find(
  (rule) => rule.source === "**" && Array.isArray(rule.headers),
);
const globalResponseHeaders = Object.fromEntries(
  (globalHeaderRule?.headers ?? []).map(({ key, value }) => [key, value]),
);

const privateRoutePrefixes = [
  "/account",
  "/api",
  "/auth/callback",
  "/dashboard",
  "/ketik",
  "/monitoring",
  "/pdkt",
  "/pending",
  "/preview",
  "/profiler",
  "/qa-analyzer",
  "/reset-password",
  "/sidak",
  "/telefun",
  "/tna",
  "/unauthorized",
  "/waiting-approval",
];
const scannerRoutePatterns = [
  /^\/(?:wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|administrator|actuator)(?:\/|$)/i,
];
const staticAssetExtensions = new Set([
  ".css",
  ".csv",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".wasm",
  ".wav",
  ".webm",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
  ".xlsx",
]);

function containsControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

function normalizePath(requestUrl) {
  const target = requestUrl ?? "/";
  const rawPath = target.startsWith("/")
    ? target.split("?", 1)[0].split("#", 1)[0]
    : new URL(target, "http://localhost").pathname;

  if (rawPath.includes("\\") || /%(?:00|2f|5c)/i.test(rawPath)) {
    throw new Error("ambiguous path encoding");
  }

  const decodedPath = decodeURIComponent(rawPath);
  if (
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    /%(?:00|2e|2f|5c)/i.test(decodedPath) ||
    containsControlCharacters(decodedPath)
  ) {
    throw new Error("ambiguous path encoding");
  }

  const segments = decodedPath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new URIError("dot-segment path");
  }

  return decodedPath;
}

function isSensitivePath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment.startsWith(".") && segment.toLowerCase() !== ".well-known",
    )
  ) {
    return true;
  }
  return scannerRoutePatterns.some((pattern) => pattern.test(pathname));
}

function isPrivateAppPath(pathname) {
  return privateRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticResourcePath(pathname) {
  return (
    pathname === "/assets" ||
    pathname.startsWith("/assets/") ||
    staticAssetExtensions.has(path.extname(pathname).toLowerCase())
  );
}

async function publicFileExists(pathname) {
  const candidate = path.resolve(distDirectory, `.${pathname}`);
  const relative = path.relative(distDirectory, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }

  try {
    return (await stat(candidate)).isFile();
  } catch (error) {
    if (error && typeof error === "object" && ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
      return false;
    }
    throw error;
  }
}

function sendTextResponse(response, method, status, message) {
  response.writeHead(status, {
    ...globalResponseHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  response.end(method === "HEAD" ? undefined : `${message}\n`);
}

async function handleRequest(request, response) {
  let pathname;
  try {
    pathname = normalizePath(request.url);
  } catch {
    sendTextResponse(response, request.method, 400, "Bad Request");
    return;
  }

  if (isSensitivePath(pathname)) {
    sendTextResponse(response, request.method, 404, "Not Found");
    return;
  }

  if (isPrivateAppPath(pathname)) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
  }

  if (isStaticResourcePath(pathname) && !(await publicFileExists(pathname))) {
    sendTextResponse(response, request.method, 404, "Not Found");
    return;
  }

  await serveHandler(request, response, handlerConfig);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      sendTextResponse(response, request.method, 500, "Internal Server Error");
    } else {
      response.destroy();
    }
    process.stderr.write("Static response failed\n");
  });
});

const port = Number(process.env.PORT) || 3005;
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  process.stdout.write(`Static web server listening on ${host}:${port}\n`);
});
