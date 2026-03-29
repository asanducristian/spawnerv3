import http from 'http';
import httpProxy from 'http-proxy';
import type { DomainStore } from './domain-store';
import type { ContainerStore } from './container-store';

/**
 * Starts a plain HTTP proxy server on the given port.
 *
 * How it works:
 *   1. nginx on the host receives *.nuazi.ro and forwards here
 *   2. We extract the subdomain from the Host header
 *      e.g.  "testwebsite-com.nuazi.ro"  →  subdomain = "testwebsite-com"
 *   3. Look up subdomain_key in domain_routes → get virtual IP
 *   4. Look up virtual IP in container_mappings → get real host:httpPort
 *   5. Proxy the request, rewriting Host back to the original domain
 *      so the container's nginx routes it to the right virtual host
 */
export function startContainerProxy(
  domainStore: DomainStore,
  containerStore: ContainerStore,
  port: number,
  baseDomain: string, // e.g. "nuazi.ro"
): http.Server {
  const proxy = httpProxy.createProxyServer({ changeOrigin: false });

  proxy.on('error', (err, _req, res) => {
    console.error('[proxy] upstream error', err.message);
    if (res instanceof http.ServerResponse && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Container unreachable' }));
    }
  });

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '';

      // Strip port if present (e.g. "testwebsite-com.nuazi.ro:3002")
      const hostname = host.split(':')[0];

      // Extract subdomain: "testwebsite-com.nuazi.ro" → "testwebsite-com"
      const suffix = `.${baseDomain}`;
      if (!hostname.endsWith(suffix)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Host must end with ${baseDomain}` }));
        return;
      }

      const subdomainKey = hostname.slice(0, hostname.length - suffix.length);

      if (!subdomainKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing subdomain' }));
        return;
      }

      // Resolve subdomain key → domain route
      const route = await domainStore.lookupBySubdomainKey(subdomainKey);
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No route registered for ${subdomainKey}.${baseDomain}` }));
        return;
      }

      // Resolve virtual IP → container host:port
      const mapping = await containerStore.lookup(route.virtual_ip);
      if (!mapping) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Container for ${route.domain} is not running` }));
        return;
      }

      // Rewrite Host so the container's nginx sees the original domain name
      req.headers.host = route.domain;

      const target = `http://${mapping.host}:${mapping.httpPort}`;
      proxy.web(req, res, { target });
    } catch (err) {
      console.error('[proxy] internal error', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal proxy error' }));
      }
    }
  });

  server.listen(port, () => {
    console.log(`[proxy] container proxy listening on port ${port} (base domain: ${baseDomain})`);
  });

  return server;
}
