export type ProductionJobKind = 'image' | 'video' | 'composition';
export type ProductionJobStatus = 'awaiting_confirmation' | 'pending' | 'running' | 'dispatched_unknown' | 'succeeded' | 'failed' | 'canceled';
export interface ProductionMediaVersion {
    readonly id: string;
    readonly targetId: string;
    readonly kind: 'image' | 'video';
    readonly url: string;
    /** Workspace-relative path when the result is owned by the DSH FileSystem. */
    readonly path?: string | undefined;
}
export interface ProductionJob {
    readonly id: string;
    readonly targetId: string;
    readonly kind: ProductionJobKind;
    readonly status: ProductionJobStatus;
    readonly progress: number;
    readonly prompt: string;
    readonly error?: string | undefined;
    readonly output?: ProductionMediaVersion | undefined;
    readonly expectedOutputs: number;
    readonly completedOutputs: number;
}
export interface ProductionSequenceItem {
    readonly shotId: string;
    readonly versionId?: string | undefined;
}
export interface CanvasPoint {
    readonly x: number;
    readonly y: number;
}
export interface ProductionQueueEntry {
    readonly id: string;
    readonly preview: string;
}
export declare function createPendingJob(input: {
    readonly id: string;
    readonly targetId: string;
    readonly kind: ProductionJobKind;
    readonly prompt: string;
    readonly expectedOutputs?: number | undefined;
}): ProductionJob;
export declare function selectedVersionForTarget(targetId: string, versions: readonly ProductionMediaVersion[], selections: Readonly<Record<string, string>>, kind?: ProductionMediaVersion['kind']): ProductionMediaVersion | undefined;
export declare function mediaTargetFromPath(path: string, knownTargets: readonly string[]): string | undefined;
export declare function mediaVersionMatchesJob(version: ProductionMediaVersion, jobId: string): boolean;
export declare function referencesForTarget(targetId: string, production: {
    readonly shots: readonly {
        readonly id: string;
        readonly references: readonly string[];
    }[];
}, versions: readonly ProductionMediaVersion[], selections: Readonly<Record<string, string>>, libraryVersions?: readonly ProductionMediaVersion[], manualReferences?: Readonly<Record<string, readonly string[]>>): ProductionMediaVersion[];
export declare function queuedItemForJob(jobId: string, queue: readonly ProductionQueueEntry[]): ProductionQueueEntry | undefined;
export declare function activeProductionJobId(jobs: readonly ProductionJob[], queue: readonly ProductionQueueEntry[], sessionRunning: boolean): string | undefined;
/** Reconcile the lightweight Session projection against DSH Queue/Turn state and real workspace outputs. */
export declare function reconcileProductionJobs(jobs: readonly ProductionJob[], queue: readonly ProductionQueueEntry[], sessionRunning: boolean, versions: readonly ProductionMediaVersion[]): ProductionJob[];
export declare function reconcileSequence(shotIds: readonly string[], current: readonly ProductionSequenceItem[], versions: readonly ProductionMediaVersion[], selections: Readonly<Record<string, string>>): ProductionSequenceItem[];
export declare function sequenceIssues(sequence: readonly ProductionSequenceItem[], versions: readonly ProductionMediaVersion[]): string[];
export declare function reorderSequence(sequence: readonly ProductionSequenceItem[], source: number, target: number): ProductionSequenceItem[];
//# sourceMappingURL=production-runtime.d.ts.map