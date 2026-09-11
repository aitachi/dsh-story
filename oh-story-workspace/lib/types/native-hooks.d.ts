import type { Context } from '@deepseek-ai/cordis';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
export interface StoryMutation {
    readonly root: string;
    readonly path: string;
    readonly chapter?: number;
}
export declare function detectStoryMutation(name: string, args: unknown, cwd: string | undefined): StoryMutation | undefined;
type StoryFileSystem = Pick<FileSystem, 'resolve' | 'contains' | 'stat' | 'listDir'>;
export declare function validateStoryMutation(fs: StoryFileSystem, mutation: StoryMutation, signal?: AbortSignal): Promise<string | undefined>;
export declare function decideStoryMutation(exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
/**
 * Native DSH equivalents of the upstream prose guards. They join DSH's typed
 * tool waterfall, so decisions remain visible in the official approval/tool UI.
 */
export declare function registerOhStoryHooks(context: Context): void;
export {};
//# sourceMappingURL=native-hooks.d.ts.map