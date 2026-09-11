/** Host registration: the /oh-story creative workspace editor API and its tools. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { registerWorkspaceRoute } from './workspace-route.js';
export { registerOhStoryHooks } from './native-hooks.js';
export { createOhStoryProductionTool, registerOhStoryProductionTool } from './production-tool.js';
export { OH_STORY_PRODUCTION_TOOL_NAME, validateProductionIntent, type ProductionIntentArgs } from './production-intent.js';
/** DSH owns models, providers, presets, permissions, roots, runs, and sessions. */
export interface Config {
    readonly editorMaxBytes?: number;
    readonly trustedHosts?: string[];
}
export declare const Config: z<Config>;
export declare const name = "oh-story-workspace";
export declare const inject: string[];
/** Mount only domain contributions into the current DSH process. */
export declare function apply(context: Context, config?: Config): Promise<void>;
declare const _default: {
    name: string;
    inject: string[];
    Config: z<Config>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map