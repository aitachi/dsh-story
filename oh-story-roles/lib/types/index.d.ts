/** Host registration: the bundled Oh Story specialist Roles and the oh_story_role tool. */
import type { Context } from '@deepseek-ai/cordis';
export { OH_STORY_ROLE_NAMES, loadBundledRole } from './role-provider.js';
export { createOhStoryRoleTool, OH_STORY_ROLE_TOOL_NAME, registerOhStoryRoleTool, roleToolFilter, type OhStoryRoleSubagents, } from './role-tool.js';
export { bundledReferenceGuard, createOhStoryReferenceTool, OH_STORY_REFERENCE_TOOL_NAME } from './reference-tool.js';
export declare const name = "oh-story-roles";
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