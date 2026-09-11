import { type SkillProvider } from '@deepseek-ai/dsh-skill';
interface ParsedSkill {
    readonly name: string;
    readonly description: string;
    readonly content: string;
}
export declare function parseBundledSkill(source: string): ParsedSkill;
export declare function dshSkillContent(name: string, content: string): string;
export declare function defaultBundledSkillRoot(): string;
export declare function defaultDramaSkillRoot(): string;
export declare function createOhStorySkillProvider(skillRoot?: string): SkillProvider;
export declare function dshDramaSkillContent(name: string, content: string): string;
export declare function createDramaSkillProvider(skillRoot?: string): SkillProvider;
export {};
//# sourceMappingURL=skill-provider.d.ts.map