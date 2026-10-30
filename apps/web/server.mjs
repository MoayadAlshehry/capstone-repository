import next from 'next';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createUploadProxy } from './upload-proxy.mjs';
const args = process.argv.slice(2),
  port = Number(args[args.indexOf('--port') + 1] || process.env.PORT || 3000);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !process.env.AUTH_SECRET
)
  throw Error('Invalid owned web configuration');
const app = next({
  dev: false,
  hostname: '127.0.0.1',
  port,
  dir: new URL('.', import.meta.url).pathname,
});
await app.prepare();
const handler = app.getRequestHandler();
const upload = createUploadProxy(process.env.UPLOAD_INTERNAL_URL);
const server = createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  delete req.headers['x-capstone-public-visitor-key'];
  const edge = req.headers['cf-connecting-ip'];
  const visitorNetwork = typeof edge === 'string' && isIP(edge) ? edge : ip;
  req.headers['x-capstone-public-visitor-key'] = createHmac(
    'sha256',
    process.env.AUTH_SECRET,
  )
    .update(
      'public-view-network-v1|' +
        new Date().toISOString().slice(0, 10) +
        '|' +
        visitorNetwork,
    )
    .digest('hex');
  delete req.headers['x-capstone-client-ip'];
  delete req.headers['x-capstone-client-signature'];
  req.headers['x-capstone-client-ip'] = ip;
  req.headers['x-capstone-client-signature'] = createHmac(
    'sha256',
    process.env.AUTH_SECRET,
  )
    .update(`account-email-ip.v1:${ip}`)
    .digest('hex');
  if (upload(req, res)) return;
  handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    process.emit('capstone.ai-v1.shutdown');
    // Explicit owned shutdown has a bounded drain, including a browser that
    // retains a completed SSE/RSC connection. Uploads use their separate service.
    const drain = setTimeout(() => server.closeAllConnections(), 2000);
    drain.unref();
    server.close(() => {
      clearTimeout(drain);
      process.exit(0);
    });
    server.closeIdleConnections();
  });
