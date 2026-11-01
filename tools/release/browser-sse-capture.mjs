/** Passive Chromium observation. No route interception, response rewrite or app state injection. */
export async function browserSSECapture(context, page, origin) {
  const cdp = await context.newCDPSession(page),
    records = new Map();
  await cdp.send('Network.enable', {
    maxTotalBufferSize: 16000000,
    maxResourceBufferSize: 4000000,
    enableDurableMessages: true,
  });
  cdp.on('Network.requestWillBeSent', (e) => {
    const u = new URL(e.request.url);
    if (
      u.origin !== origin ||
      u.pathname !== '/api/ai' ||
      e.request.method !== 'POST'
    )
      return;
    let input;
    try {
      input = JSON.parse(e.request.postData ?? '{}');
    } catch {
      return;
    }
    records.set(e.requestId, {
      id: e.requestId,
      input,
      started: Date.now(),
      chunks: [],
      status: null,
      terminal: false,
      captureError: null,
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = records.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.streaming = true;
    void cdp
      .send('Network.streamResourceContent', { requestId: e.requestId })
      .then((v) => {
        r.chunks.unshift(Buffer.from(v.bufferedData, 'base64'));
        r.enabled = true;
      })
      .catch(async (error) => {
        try {
          const v = await cdp.send('Network.getResponseBody', {
            requestId: e.requestId,
          });
          r.chunks = [Buffer.from(v.body, v.base64Encoded ? 'base64' : 'utf8')];
          r.enabled = true;
          r.terminal = true;
          r.captureFallback = 'finished-body';
        } catch (next) {
          r.captureError = error.message + '; fallback: ' + next.message;
        }
      });
  });
  cdp.on('Network.dataReceived', (e) => {
    const r = records.get(e.requestId);
    if (r && e.data) r.chunks.push(Buffer.from(e.data, 'base64'));
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = records.get(e.requestId);
    if (r) r.terminal = true;
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = records.get(e.requestId);
    if (r) {
      r.terminal = true;
      r.networkTermination = e.errorText;
    }
  });
  return {
    audit() {
      return [...records.values()].map((r) => ({
        action: r.input.action,
        query: r.input.query,
        effort: r.input.effort,
        started: r.started,
        status: r.status,
        terminal: r.terminal,
        networkTermination: r.networkTermination ?? null,
        captureFallback: r.captureFallback ?? null,
      }));
    },
    seen(predicate, after) {
      return [...records.values()].some(
        (x) => x.started >= after && predicate(x.input),
      );
    },
    async wait(predicate, after) {
      const until = Date.now() + 135000;
      while (Date.now() < until) {
        const r = [...records.values()].find(
          (x) => x.started >= after && predicate(x.input),
        );
        if (r) {
          if (r.captureError)
            throw Error('PASSIVE_CAPTURE_FAILED: ' + r.captureError);
          const body = Buffer.concat(r.chunks).toString('utf8');
          if (
            r.enabled &&
            (/data: \{"type":"done"\}\r?\n\r?\n/.test(body) ||
              /data: \{"type":"error"[^\n]*\}\r?\n\r?\n/.test(body))
          )
            return {
              input: r.input,
              status: r.status,
              body,
              networkTermination: r.networkTermination ?? null,
              mechanism: 'passive Network.streamResourceContent',
            };
          if (r.terminal && r.enabled) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const final = Buffer.concat(r.chunks).toString('utf8');
            return {
              input: r.input,
              status: r.status,
              body: final,
              networkTermination: r.networkTermination ?? null,
              mechanism: 'passive Network.streamResourceContent',
            };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error('PASSIVE_CAPTURE_WATCHDOG');
    },
    async close() {
      await cdp.detach();
    },
  };
}
