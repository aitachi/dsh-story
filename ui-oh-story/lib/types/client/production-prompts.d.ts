import type { DramaEpisodeProduction } from './drama-production.js';
import type { ProductionJob, ProductionMediaVersion } from './production-runtime.js';
export declare function nativeProductionPrompt(production: DramaEpisodeProduction, job: ProductionJob, references: readonly ProductionMediaVersion[]): string;
export declare function nativeBatchPrompt(production: DramaEpisodeProduction, job: ProductionJob, candidates: readonly {
    readonly id: string;
    readonly prompt: string;
}[]): string;
export declare function nativeCompositionPrompt(production: DramaEpisodeProduction, job: ProductionJob, orderedPaths: readonly string[]): string;
//# sourceMappingURL=production-prompts.d.ts.map