export function assertRequiredBindings(
  container: { NetworkSettings?: { Ports?: Record<string, unknown> } },
  expected: Record<string, number | string>,
): void;
export function verifyOwned(): Promise<{
  state: {
    root: string;
    owner: string;
    project: string;
    ai_root: string;
    completed: string[];
    ports: Record<'web' | 'upload' | 'worker' | 'db' | 'smtp' | 'mail_ui', number>;
    [key: string]: unknown;
  };
  base: string;
  proof: {
    source_root_verified: boolean;
    processes: { role: string; port: number; pid: number; loopback: boolean; owned_socket: boolean }[];
    docker_labels_verified: boolean;
    all_binds_loopback: boolean;
    public_target_requests: number;
  };
}>;
