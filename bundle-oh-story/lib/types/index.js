/** Release aggregator: one entry assembling every Oh Story capability.

Used only by the self-contained release tarball build (pack.mjs); inside the
repository the bundle's cordis.patch.yml composes the split rows instead.
*/
import { apply as applySkills } from '@oh-story/skills';
import { apply as applyRoles } from '@oh-story/roles';
import { Config as WorkspaceConfig, apply as applyWorkspace } from '@oh-story/workspace';
export const name = 'oh-story';
export const inject = ['skills', 'subagents', 'tools', 'typert', 'webServer'];
export const Config = WorkspaceConfig;
/** Mount every Oh Story capability into the current DSH process. */
export async function apply(context, config = {}) {
    await applySkills(context);
    await applyRoles(context);
    await applyWorkspace(context, config);
}
export default { name, inject, Config, apply };
//# sourceMappingURL=index.js.map