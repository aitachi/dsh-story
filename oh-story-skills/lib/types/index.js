/** Host registration: the bundled Oh Story and short-drama Skill catalogs. */
import { createDramaSkillProvider, createOhStorySkillProvider } from './skill-provider.js';
export { createDramaSkillProvider, createOhStorySkillProvider, defaultBundledSkillRoot, defaultDramaSkillRoot, parseBundledSkill, } from './skill-provider.js';
export const name = 'oh-story-skills';
export const inject = ['skills'];
/** Mount only domain contributions into the current DSH process. */
export async function apply(context) {
    context.skills.registerProvider(() => createOhStorySkillProvider());
    context.skills.registerProvider(() => createDramaSkillProvider());
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map