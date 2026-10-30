import { release } from 'node:os';

/** Keep WSL resources separate from the retained Windows rollback volumes. */
export function composeProject(platform: string, kernel: string) {
  return platform === 'linux' && /microsoft/i.test(kernel)
    ? 'capstone-wsl'
    : 'capstone-local';
}
export const localComposeProject = composeProject(process.platform, release());

/** Only the existing native Windows desktop context or a local Unix CI socket. */
export function safeLocalDocker(
  context: string,
  endpoint: string,
  platform = process.platform,
) {
  return platform === 'win32'
    ? context === 'desktop-linux' &&
        endpoint === 'npipe:////./pipe/dockerDesktopLinuxEngine'
    : context === 'default' && endpoint === 'unix:///var/run/docker.sock';
}

/** POSIX ownership paths are case-sensitive; Windows paths retain native comparison. */
export function sameWorkspaceDirectory(
  actual: string,
  expected: string,
  platform = process.platform,
) {
  return platform === 'win32'
    ? actual.replaceAll('\\', '/').toLowerCase() ===
        expected.replaceAll('\\', '/').toLowerCase()
    : actual === expected;
}
