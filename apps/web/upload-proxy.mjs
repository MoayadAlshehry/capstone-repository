import { request } from 'node:http';
const LIMIT = 6_000_000;
const hop = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const clean = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(([key]) => !hop.has(key.toLowerCase())),
  );
/** Same /files transport and body bound, resolved from owned runtime config.
 * Authentication, admission, paths, quota and tus semantics remain upstream. */
export function createUploadProxy(value = 'http://127.0.0.1:3001') {
  const target = new URL(value);
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    !Number.isInteger(Number(target.port)) ||
    Number(target.port) < 1024 ||
    Number(target.port) > 65535
  )
    throw Error('Invalid owned upload proxy configuration');
  return (req, res) => {
    const path = req.url?.split('?')[0];
    if (
      !req.url?.startsWith('/') ||
      req.url.startsWith('//') ||
      !(path === '/files' || path.startsWith('/files/'))
    )
      return false;
    const length = req.headers['content-length'];
    if (
      length !== undefined &&
      (!/^\d+$/.test(length) || Number(length) > LIMIT)
    ) {
      res.writeHead(413, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    let bytes = 0,
      limited = false;
    const upstream = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...clean(req.headers), host: target.host },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, clean(response.headers));
        response.pipe(res);
      },
    );
    upstream.setTimeout(60000, () =>
      upstream.destroy(Error('UPLOAD_UPSTREAM_TIMEOUT')),
    );
    upstream.on('error', () => {
      if (limited) return;
      if (!res.headersSent)
        res.writeHead(502, {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        });
      res.end(
        'Upload service is temporarily unavailable. Check the original transfer before retrying.',
      );
    });
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMIT && !limited) {
        limited = true;
        req.unpipe(upstream);
        upstream.destroy();
        if (!res.headersSent)
          res.writeHead(413, { 'Cache-Control': 'no-store' });
        res.end();
      }
    });
    req.once('aborted', () => upstream.destroy());
    res.once('close', () => upstream.destroy());
    req.pipe(upstream);
    return true;
  };
}
