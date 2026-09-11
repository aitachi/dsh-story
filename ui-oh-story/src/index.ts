/**
 * Host registration for the Oh Story creative workbench client.
 * Deliberately empty: the workbench is a browser capability contributed through
 * the package's `dsh.client` bundle; the host half exists only so the Loader
 * row for this package mounts.
 */

/** Host plugin body — the workbench UI lives in the client bundle. */
export function apply(): void {}

export const name = 'oh-story-ui'
export const inject: readonly string[] = []
export default { name, inject, apply }
