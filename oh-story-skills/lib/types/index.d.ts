/** Host registration: the bundled Oh Story and short-drama Skill catalogs. */
import type { Context } from '@deepseek-ai/cordis';
export { createDramaSkillProvider, createOhStorySkillProvider, defaultBundledSkillRoot, defaultDramaSkillRoot, parseBundledSkill, } from './skill-provider.js';
export declare const name = "oh-story-skills";
export declare const inject: string[];
/** Mount only domain contributions into the current DSH process. */
export declare function apply(context: Context): Promise<void>;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map