const http = require('http');

// The public add-on never forwards HA/provider credentials to this service.
// The assistant worker binds loopback and owns the sole HA execution boundary.
function proxyAssistantRequest(req, res, baseUrl = 'http://127.0.0.1:8787') {
  const target = new URL(req.url, baseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.protocol !== 'http:') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Assistant worker must use local HTTP.' }));
    return;
  }
  const headers = {};
  for (const key of ['content-type', 'content-length']) if (req.headers[key]) headers[key] = req.headers[key];
  const forwarded = http.request(target, { method: req.method, headers, timeout: 180000 }, (response) => {
    res.writeHead(response.statusCode || 502, { 'content-type': response.headers['content-type'] || 'application/json' });
    response.pipe(res);
  });
  forwarded.on('timeout', () => forwarded.destroy(new Error('timeout')));
  forwarded.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Assistant worker is unavailable.' }));
  });
  req.pipe(forwarded);
}

module.exports = { proxyAssistantRequest };
