import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
const copy = {
    title: '短剧素材与镜头关系画布', note: '从右侧连接点拖到另一模块；支持一连多、多连一。也可依次点击输出点和输入点。选中连线后按 Delete 删除。',
    input: '连接到', output: '从此模块连出', cancel: '取消连接', reset: '复位布局', empty: '请先生成素材或分镜文档。',
};
/** Directed manual graph. Document edges seed the graph until the first saved edit. */
export function ManualCanvas(props) {
    const [pending, setPending] = useState();
    const [selectedEdge, setSelectedEdge] = useState();
    const surface = useRef(null);
    const cleanup = useRef();
    useEffect(() => () => cleanup.current?.(), []);
    const nodes = [
        ...[...props.production.assets, ...props.production.visualAssets].map((asset, index) => ({ id: asset.id, label: asset.title, type: 'asset', initial: { x: 80, y: 80 + index * 150 } })),
        ...props.production.shots.map((shot, index) => ({ id: shot.id, label: shot.title, type: 'shot', initial: { x: 640, y: 80 + index * 180 } })),
    ].filter((node, index, all) => all.findIndex(item => item.id === node.id) === index);
    const positions = Object.fromEntries(nodes.map(node => [node.id, props.canvas[node.id] ?? node.initial]));
    const links = props.canvasLinks ?? props.production.shots.flatMap(shot => shot.references.map(reference => [reference, shot.id]));
    const connect = (from, to) => {
        if (from !== to && nodes.some(node => node.id === to) && !links.some(link => link[0] === from && link[1] === to))
            props.onCanvasLinksChange?.([...links, [from, to]]);
        setPending(undefined);
    };
    const track = (move, end) => {
        cleanup.current?.();
        const stop = () => { globalThis.removeEventListener('pointermove', move); globalThis.removeEventListener('pointerup', up); globalThis.removeEventListener('pointercancel', cancel); cleanup.current = undefined; };
        const up = (event) => { stop(); end(event); };
        const cancel = () => { stop(); setPending(undefined); };
        cleanup.current = stop;
        globalThis.addEventListener('pointermove', move);
        globalThis.addEventListener('pointerup', up);
        globalThis.addEventListener('pointercancel', cancel);
    };
    const pointAt = (event) => {
        const bounds = surface.current.getBoundingClientRect();
        return { x: (event.clientX - bounds.left) / props.zoom, y: (event.clientY - bounds.top) / props.zoom };
    };
    const dragLink = (event, from) => {
        event.stopPropagation();
        event.preventDefault();
        if (event.button !== 0)
            return;
        setPending({ from, point: pointAt(event) });
        track(move => setPending({ from, point: pointAt(move) }), up => {
            const target = document.elementFromPoint(up.clientX, up.clientY)?.closest('[data-node-id]');
            if (target?.dataset.nodeId !== undefined)
                connect(from, target.dataset.nodeId);
            else
                setPending(undefined);
        });
    };
    const drag = (event, id, origin) => {
        if (event.button !== 0)
            return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = { x: event.clientX, y: event.clientY };
        track(move => props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + (move.clientX - start.x) / props.zoom, y: origin.y + (move.clientY - start.y) / props.zoom } }), () => { });
    };
    const remove = (from, to) => props.onCanvasLinksChange?.(links.filter(link => link[0] !== from || link[1] !== to));
    const arrow = (from, to) => {
        const a = positions[from];
        const b = positions[to];
        if (!a || !b)
            return null;
        const id = `edge:${from}:${to}`;
        const start = { x: a.x + 180, y: a.y + 50 };
        const end = { x: b.x, y: b.y + 50 };
        const control = props.canvas[id] ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
        const reset = () => { const next = { ...props.canvas }; delete next[id]; props.onCanvasChange(next); };
        return _jsxs("g", { "data-active": selectedEdge === id || undefined, children: [_jsx("path", { className: "oh-story-canvas-edge", markerEnd: "url(#oh-story-canvas-arrowhead)", d: path }), _jsx("path", { className: "oh-story-canvas-edge-hit", "data-edge-id": id, role: "button", tabIndex: 0, "aria-label": `拖动箭头 ${from} 到 ${to}；Delete 删除，方向键微调，Esc 复位`, d: path, onPointerDown: event => { setSelectedEdge(id); props.onSelect(to); drag(event, id, control); }, onKeyDown: event => {
                        const step = event.shiftKey ? 40 : 10;
                        const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined;
                        if (delta) {
                            event.preventDefault();
                            props.onCanvasChange({ ...props.canvas, [id]: { x: control.x + delta[0], y: control.y + delta[1] } });
                        }
                        else if (event.key === 'Delete' || event.key === 'Backspace') {
                            event.preventDefault();
                            remove(from, to);
                        }
                        else if (event.key === 'Escape')
                            reset();
                    }, onDoubleClick: reset }), _jsx("circle", { className: "oh-story-canvas-edge-handle", cx: control.x, cy: control.y, r: "5" })] }, id);
    };
    return _jsxs("section", { className: "oh-story-canvas-shell", "aria-label": copy.title, onKeyDown: event => { if (event.key === 'Escape') {
            cleanup.current?.();
            setPending(undefined);
        } }, children: [_jsx("div", { className: "oh-story-projection-note", children: copy.note }), _jsxs("div", { className: "oh-story-canvas-controls", children: [_jsx("button", { type: "button", "aria-label": "\u7F29\u5C0F\u753B\u5E03", onClick: () => props.onZoomChange(Math.max(.5, props.zoom - .1)), children: "\u2212" }), _jsxs("span", { children: [Math.round(props.zoom * 100), "%"] }), _jsx("button", { type: "button", "aria-label": "\u653E\u5927\u753B\u5E03", onClick: () => props.onZoomChange(Math.min(1.8, props.zoom + .1)), children: "\uFF0B" }), _jsx("button", { type: "button", onClick: () => { props.onCanvasChange({}); props.onZoomChange(.65); }, children: copy.reset }), pending && _jsx("button", { type: "button", onClick: () => setPending(undefined), children: copy.cancel }), selectedEdge && _jsx("button", { type: "button", onClick: () => { const link = links.find(([a, b]) => `edge:${a}:${b}` === selectedEdge); if (link)
                            remove(...link); setSelectedEdge(undefined); }, children: "\u5220\u9664\u6240\u9009\u8FDE\u7EBF" })] }), nodes.length === 0 ? _jsx("p", { children: copy.empty }) : _jsx("div", { className: "oh-story-canvas-viewport", children: _jsxs("div", { ref: surface, className: "oh-story-canvas", style: { transform: `scale(${props.zoom})`, minHeight: Math.max(1000, ...Object.values(positions).map(point => point.y + 200)), minWidth: Math.max(1200, ...Object.values(positions).map(point => point.x + 300)) }, children: [_jsxs("svg", { children: [_jsx("defs", { children: _jsx("marker", { id: "oh-story-canvas-arrowhead", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse", children: _jsx("polygon", { points: "0,0 10,5 0,10" }) }) }), links.map(([from, to]) => arrow(from, to)), pending?.point && positions[pending.from] && _jsx("path", { className: "oh-story-canvas-edge", style: { pointerEvents: 'none', strokeDasharray: '8 5' }, markerEnd: "url(#oh-story-canvas-arrowhead)", d: `M ${positions[pending.from].x + 180} ${positions[pending.from].y + 50} L ${pending.point.x} ${pending.point.y}` })] }), nodes.map(node => _jsxs("article", { tabIndex: 0, "data-node-id": node.id, "data-node-type": node.type, "aria-label": `${node.type === 'asset' ? '素材' : '镜头'} ${node.label}`, "data-selected": node.id === props.selectedId || undefined, style: { left: positions[node.id].x, top: positions[node.id].y, touchAction: 'none' }, onPointerDown: event => drag(event, node.id, positions[node.id]), onDoubleClick: () => { const target = props.production.targets.get(node.id); if (target)
                                props.onNavigate(target); }, onKeyDown: event => { if (event.target !== event.currentTarget)
                                return; const step = event.shiftKey ? 40 : 10; const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined; if (delta) {
                                event.preventDefault();
                                props.onCanvasChange({ ...props.canvas, [node.id]: { x: positions[node.id].x + delta[0], y: positions[node.id].y + delta[1] } });
                            } }, children: [_jsx("button", { type: "button", className: "oh-story-canvas-port", "data-port": "in", style: { left: -12 }, "aria-label": `${copy.input} ${node.id}`, title: copy.input, onPointerDown: event => event.stopPropagation(), onClick: () => { if (pending)
                                        connect(pending.from, node.id); }, children: "\u25CF" }), _jsx("small", { children: node.type === 'asset' ? '素材' : '镜头' }), _jsx("strong", { children: node.label }), _jsx("span", { children: node.id }), _jsx("button", { type: "button", className: "oh-story-canvas-port", "data-port": "out", style: { right: -12 }, "aria-label": `${copy.output} ${node.id}`, title: copy.output, onPointerDown: event => dragLink(event, node.id), onClick: event => { event.stopPropagation(); setPending({ from: node.id }); }, children: "\u279C" })] }, node.id))] }) })] });
}
//# sourceMappingURL=manual-canvas.js.map