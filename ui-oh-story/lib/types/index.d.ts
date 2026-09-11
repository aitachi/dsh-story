/**
 * Host registration for the Oh Story creative workbench client.
 * Deliberately empty: the workbench is a browser capability contributed through
 * the package's `dsh.client` bundle; the host half exists only so the Loader
 * row for this package mounts.
 */
/** Host plugin body — the workbench UI lives in the client bundle. */
export declare function apply(): void;
export declare const name = "oh-story-ui";
export declare const inject: readonly string[];
declare const _default: {
    name: string;
    inject: readonly string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map