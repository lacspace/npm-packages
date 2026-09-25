/** A tiny local site for the tool tests. Test-only. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const PAGES: Record<string, { type: string; body: string | Buffer; status?: number; headers?: Record<string, string> }> = {
  "/": {
    type: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="en"><head><title>Acme Widgets</title><meta name="description" content="Widgets for everyone"><link rel="canonical" href="https://acme.example/"><meta property="og:title" content="Acme"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script></head>
<body><h1>Welcome to Acme</h1><p>We make <strong>widgets</strong>. Contact sales@acme.example or +1 555 0100.</p>
<h2>Products</h2><ul class="products"><li class="product"><h3>Alpha</h3><span class="price">$10.00</span><a href="/alpha">Details</a></li><li class="product"><h3>Beta</h3><span class="price">$25.50</span><a href="/beta">Details</a></li></ul>
<table><tr><th>Name</th><th>Price</th></tr><tr><td>Alpha</td><td>10</td></tr></table>
<h2>Story</h2><p>${"Acme began in a garage with one lathe and a stubborn idea about widgets. ".repeat(12)}</p>
<a href="/about">About</a> <a href="https://elsewhere.example/x">Elsewhere</a></body></html>`,
  },
  "/alpha": { type: "text/html", body: "<html><head><title>Alpha</title></head><body><h1>Alpha</h1><p>The first widget.</p><a href='/'>Home</a></body></html>" },
  "/beta": { type: "text/html", body: "<html><head><title>Beta</title></head><body><h1>Beta</h1><p>The second widget.</p></body></html>" },
  "/about": { type: "text/html", body: "<html><head><title>About Acme</title></head><body><h1>About</h1><p>Founded 2020.</p></body></html>" },
  "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n" },
  "/sitemap.xml": { type: "application/xml", body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/</loc></url></urlset>' },
  "/data.json": { type: "application/json", body: JSON.stringify({ ok: true, items: [1, 2, 3] }) },
  "/doc.txt": { type: "text/plain", body: "Quarterly report\n\nRevenue grew 12%.\n" },
  "/doc.csv": { type: "text/csv", body: "name,qty\nbolt,4\nnut,9\n" },
  "/redirect": { type: "text/plain", body: "", status: 302, headers: { location: "/about" } },
  "/missing": { type: "text/plain", body: "gone", status: 404 },
};

export async function startFixture(): Promise<{ base: string; server: Server; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const page = PAGES[url.pathname];
    if (!page) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
    const body = typeof page.body === "string" ? page.body.replace(/href='\/'/g, "href='/'") : page.body;
    res.writeHead(page.status ?? 200, { "content-type": page.type, server: "fixture", "cache-control": "max-age=60", ...(page.headers ?? {}) });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, server, close: () => new Promise((r) => server.close(() => r())) };
}
