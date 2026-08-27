/**
 * Legacy compatibility marker.
 *
 * The old file contained a shell `node -e` command despite having a .js
 * extension and could overwrite the canonical server. It is intentionally
 * non-destructive now. The authoritative production entry is src/server.js.
 */
console.log("ADE production server builder: canonical entry is src/server.js; no source mutation performed.");
