import { createServer } from 'node:http';
import {
  loadServerConfig,
  loadInfrastructureConfig,
} from '@capstone/config/server';
import { createUploadRuntime } from '@capstone/infrastructure/uploads';
try {
  const config = loadServerConfig(3001),
    infrastructure = loadInfrastructureConfig(),
    authentication = {
      secret: process.env['AUTH_SECRET'] ?? '',
      baseURL: process.env['AUTH_BASE_URL'] ?? '',
    };
  const upload = await createUploadRuntime({
    ...infrastructure,
    secret: authentication.secret,
    baseURL: authentication.baseURL,
    origins: [authentication.baseURL],
    ...(process.env['LOCAL_PUBLIC_ORIGIN']
      ? { localPublicOrigin: process.env['LOCAL_PUBLIC_ORIGIN'] }
      : {}),
  });
  const server = createServer((request, response) => {
    void upload.handle(request, response);
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 30000;
  server.on('error', () => {
    console.error(
      'Upload service could not bind its configured private listener.',
    );
    process.exitCode = 1;
  });
  server.listen(config.SERVICE_PORT, config.BIND_HOST, () =>
    console.log(
      JSON.stringify({
        service: 'upload',
        status: 'infrastructure-ready',
        phase: 'PHASE_15',
      }),
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close(() => {
        void upload.close();
      });
      server.closeIdleConnections();
    });
} catch {
  console.error('Upload service configuration or dependencies unavailable.');
  process.exitCode = 1;
}
