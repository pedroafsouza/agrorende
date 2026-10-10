import http from "node:http";
import type { AddressInfo } from "node:net";

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
interface MetroConfig {
  server: { enhanceMiddleware: (middleware: Middleware) => Middleware };
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function loadConfig(proxy: string): MetroConfig {
  const previous = process.env.AGRORENDE_WEB_API_PROXY;
  process.env.AGRORENDE_WEB_API_PROXY = proxy;
  let config: MetroConfig | undefined;
  jest.isolateModules(() => {
    config = jest.requireActual<MetroConfig>("../../metro.config.cjs");
  });
  if (previous === undefined) delete process.env.AGRORENDE_WEB_API_PROXY;
  else process.env.AGRORENDE_WEB_API_PROXY = previous;
  return config as MetroConfig;
}

async function viaMetro(proxy: string, path: string): Promise<{ status: number; body: string }> {
  const config = loadConfig(proxy);
  const handler = config.server.enhanceMiddleware((_req, res) => {
    res.writeHead(404);
    res.end("metro");
  });
  const front = http.createServer((req, res) => handler(req, res, () => undefined));
  const port = await listen(front);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.text() };
  } finally {
    await close(front);
  }
}

describe("metro web API proxy", () => {
  let upstream: http.Server;
  let upstreamPort: number;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`${req.url} host=${req.headers.host}`);
    });
    upstreamPort = await listen(upstream);
  }, 60_000);

  afterAll(async () => {
    await close(upstream);
  });

  it("forwards /api/* and keeps the proxy path prefix and the query string", async () => {
    const result = await viaMetro(`http://127.0.0.1:${upstreamPort}/prefix/`, "/api/v1/me?x=1");
    expect(result).toEqual({ status: 200, body: `/prefix/api/v1/me?x=1 host=127.0.0.1:${upstreamPort}` });
  }, 60_000);

  it("leaves other paths to Metro", async () => {
    expect(await viaMetro(`http://127.0.0.1:${upstreamPort}`, "/index.bundle")).toEqual({ status: 404, body: "metro" });
  }, 60_000);

  it("answers 502 instead of crashing on an invalid proxy URL or an unreachable upstream", async () => {
    expect((await viaMetro("not a url", "/api/v1/me")).status).toBe(502);
    expect((await viaMetro("ftp://127.0.0.1/", "/api/v1/me")).status).toBe(502);
    expect((await viaMetro("http://127.0.0.1:1", "/api/v1/me")).status).toBe(502);
  }, 60_000);

  it("uses https for an https proxy URL", async () => {
    // A plain HTTP server cannot complete a TLS handshake, so an https request to it fails with 502.
    expect((await viaMetro(`https://127.0.0.1:${upstreamPort}`, "/api/v1/me")).status).toBe(502);
  }, 60_000);
});
