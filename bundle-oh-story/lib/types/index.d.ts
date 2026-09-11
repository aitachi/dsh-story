/** Release aggregator: one entry assembling every Oh Story capability.

Used only by the self-contained release tarball build (pack.mjs); inside the
repository the bundle's cordis.patch.yml composes the split rows instead.
*/
import { Config as WorkspaceConfig } from '@oh-story/workspace';
export declare const name = "oh-story";
export declare const inject: string[];
export type Config = WorkspaceConfig;
export declare const Config: import("@deepseek-ai/schemastery").default<WorkspaceConfig>;
/** Mount every Oh Story capability into the current DSH process. */
export declare function apply(context: import('@deepseek-ai/cordis').Context, config?: Config): Promise<void>;
declare const _default: {
    name: string;
    inject: string[];
    Config: import("@deepseek-ai/schemastery").default<WorkspaceConfig>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map