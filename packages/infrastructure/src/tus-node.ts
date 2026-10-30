import 'server-only';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
// Node-facing ABI only. srvx's umbrella declarations require unrelated Bun/Deno/
// cloud globals; this boundary keeps strict application checking and no global skip.
export interface TusUpload {
  id: string;
  size: number | undefined;
  offset: number;
  metadata: Record<string, string | null> | undefined;
}
interface Store {
  extensions: string[];
  create(upload: TusUpload): Promise<TusUpload>;
  getUpload(id: string): Promise<TusUpload>;
  write(stream: Readable, id: string, offset: number): Promise<number>;
  remove(id: string): Promise<void>;
}
interface TusError {
  status_code: number;
  body: string;
}
interface Request {
  method: string;
}
interface Options {
  path: string;
  datastore: Store;
  namingFunction: () => string;
  relativeLocation: boolean;
  respectForwardedHeaders: boolean;
  maxSize: number;
  disableTerminationForFinishedUploads: boolean;
  allowedCredentials: boolean;
  allowedOrigins: string[];
  onIncomingRequest: (req: Request, id: string) => Promise<void>;
  onResponseError: (
    req: Request,
    e: unknown,
  ) => TusError | undefined | Promise<TusError | undefined>;
}
interface Api {
  DataStore: new () => Store;
  Upload: new (value: {
    id: string;
    size: number;
    offset: number;
    metadata: Record<string, string | null>;
  }) => TusUpload;
  Server: new (options: Options) => {
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    options: Options;
  };
}
export const tusNode = (await import(
  import.meta.resolve('@tus/server')
)) as Api;
