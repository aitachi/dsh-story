import type { Context } from '@deepseek-ai/cordis';
interface WorkspaceRouteOptions {
    readonly maxBytes: number;
    readonly trustedHosts?: readonly string[];
}
export declare function assertCreativePath(path: string, kind: 'text' | 'media'): void;
export declare function mediaMimeTypeForPath(path: string): string | undefined;
/** Mount the narrow editor API on DSH's official web-server extension seam. */
export declare function registerWorkspaceRoute(context: Context, options: WorkspaceRouteOptions): void;
export {};
//# sourceMappingURL=workspace-route.d.ts.map