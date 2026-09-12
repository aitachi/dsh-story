import type { CanvasPoint } from './production-runtime.js';
import type { Props } from './drama-production-view.js';
export type CanvasLink = readonly [string, string];
export interface CanvasState {
    positions: Record<string, CanvasPoint>;
    links: CanvasLink[];
}
/** Directed manual graph. Document edges seed the graph until the first saved edit. */
export declare function ManualCanvas(props: Props): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=manual-canvas.d.ts.map