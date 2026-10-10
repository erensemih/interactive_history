import { currentHost } from './sampleProvider';

/**
 * Opens the platform's own permissions panel: the way out of a declined consent. Only ever from a
 * button the reader pressed. Resolves false where there is no such panel (the reader is pointed to the
 * artifact's Permissions menu instead).
 */
export async function openPermissionsPanel(host = currentHost()): Promise<boolean> {
  try {
    const permissions = (await host?.use('permissions')) as { manage?: () => Promise<void> } | null | undefined;
    if (!permissions?.manage) return false;
    await permissions.manage();
    return true;
  } catch {
    return false;
  }
}
