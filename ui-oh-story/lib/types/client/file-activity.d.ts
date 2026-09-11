import type { ChatSnapshot, PartialAssistant, RunningToolCall } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
export type MutationToolName = 'write' | 'edit' | 'str_replace_editor';
export interface FileMutationActivity {
    readonly callId: string;
    readonly name: MutationToolName;
    readonly argsRaw: string;
    readonly stage: 'streaming' | 'running';
    readonly path: string | undefined;
    readonly operation: 'replace-file' | 'replace-text' | 'insert-text' | undefined;
    readonly oldText: string | undefined;
    readonly newText: string | undefined;
    readonly replaceAll: boolean;
}
interface JsonStringPrefix {
    readonly value: string;
    readonly complete: boolean;
}
export type WorkbenchMode = 'story' | 'drama';
export interface WorkspaceFilePath {
    readonly path: string;
}
/** Read the latest running Assistant step, including tool-only steps hidden from the Chat list. */
export declare function streamingAssistant(timeline: ConversationTimelineSnapshot): PartialAssistant | null;
/** Read a JSON string even while the model is still streaming its closing quote. */
export declare function jsonStringPrefix(raw: string, key: string): JsonStringPrefix | undefined;
/** Return every active file mutation in official DSH dispatch order, including nested Code Mode calls. */
export declare function fileMutations(runningCalls: readonly RunningToolCall[], partial?: PartialAssistant | null): FileMutationActivity[];
/** Running calls whose settlement may have changed creative files. */
export declare function mutatingCallIds(runningCalls: readonly RunningToolCall[]): ReadonlySet<string>;
/** Latest durable successful mutation, used when a fast call skips the live render window. */
export declare function latestSettledMutation(chat: ChatSnapshot): string | undefined;
/** Convert a DSH tool path to the creative-relative path accepted by the narrow route. */
export declare function creativeRelativePath(path: string | undefined, cwd: string | undefined): string | undefined;
export declare function workbenchModeForPath(path: string | undefined): WorkbenchMode | undefined;
/** Choose the first useful document when a creative workbench opens. */
export declare function preferredWorkbenchFile(files: readonly WorkspaceFilePath[], mode: WorkbenchMode): string | undefined;
/** Project one streamed mutation over its immediate predecessor. */
export declare function previewMutation(activity: FileMutationActivity, base: string): string | undefined;
export {};
//# sourceMappingURL=file-activity.d.ts.map