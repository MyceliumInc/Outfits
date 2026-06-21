import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { HANDLERS, ScopeViolation } from "../dist/index.js";

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("http.fetch rejects a redirect to a disallowed host", async () => {
  const { server } = await listen((_req, res) => {
    res.writeHead(302, { location: "http://evil.example.com/" });
    res.end();
  });
  try {
    await assert.rejects(
      HANDLERS["http.fetch"]({ url: `http://127.0.0.1:${server.address().port}/` }, { domains: ["127.0.0.1"] }),
      ScopeViolation
    );
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test("http.fetch caps the number of redirects", async () => {
  const { server } = await listen((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/` });
    res.end();
  });
  try {
    await assert.rejects(
      HANDLERS["http.fetch"]({ url: `http://127.0.0.1:${server.address().port}/` }, { domains: ["127.0.0.1"] }),
      /redirects/
    );
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test("http.fetch follows an allowed redirect and returns the body", async () => {
  const target = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("final destination");
  });
  const entry = await listen((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${target.server.address().port}/` });
    res.end();
  });
  try {
    const out = await HANDLERS["http.fetch"](
      { url: `http://127.0.0.1:${entry.server.address().port}/` },
      { domains: ["127.0.0.1"] }
    );
    assert.match(out, /final destination/);
  } finally {
    entry.server.closeAllConnections?.();
    entry.server.close();
    target.server.closeAllConnections?.();
    target.server.close();
  }
});
