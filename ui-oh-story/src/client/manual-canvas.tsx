import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { CanvasPoint } from './production-runtime.js'
import type { Props } from './drama-production-view.js'

export type CanvasLink = readonly [string, string]
export interface CanvasState { positions: Record<string, CanvasPoint>; links: CanvasLink[] }
const copy = {
  title: '短剧素材与镜头关系画布', note: '从右侧连接点拖到另一模块；支持一连多、多连一。也可依次点击输出点和输入点。选中连线后按 Delete 删除。',
  input: '连接到', output: '从此模块连出', cancel: '取消连接', reset: '复位布局', empty: '请先生成素材或分镜文档。',
}

/** Directed manual graph. Document edges seed the graph until the first saved edit. */
export function ManualCanvas(props: Props) {
  const [pending, setPending] = useState<{ from: string; point?: CanvasPoint } | undefined>()
  const [selectedEdge, setSelectedEdge] = useState<string>()
  const surface = useRef<HTMLDivElement>(null)
  const cleanup = useRef<(() => void) | undefined>()
  useEffect(() => () => cleanup.current?.(), [])
  const nodes = [
    ...[...props.production.assets, ...props.production.visualAssets].map((asset, index) => ({ id: asset.id, label: asset.title, type: 'asset', initial: { x: 80, y: 80 + index * 150 } })),
    ...props.production.shots.map((shot, index) => ({ id: shot.id, label: shot.title, type: 'shot', initial: { x: 640, y: 80 + index * 180 } })),
  ].filter((node, index, all) => all.findIndex(item => item.id === node.id) === index)
  const positions = Object.fromEntries(nodes.map(node => [node.id, props.canvas[node.id] ?? node.initial]))
  const links = props.canvasLinks ?? props.production.shots.flatMap(shot => shot.references.map(reference => [reference, shot.id] as const))
  const connect = (from: string, to: string) => {
    if (from !== to && nodes.some(node => node.id === to) && !links.some(link => link[0] === from && link[1] === to)) props.onCanvasLinksChange?.([...links, [from, to]])
    setPending(undefined)
  }
  const track = (move: (event: PointerEvent) => void, end: (event: PointerEvent) => void) => {
    cleanup.current?.()
    const stop = () => { globalThis.removeEventListener('pointermove', move); globalThis.removeEventListener('pointerup', up); globalThis.removeEventListener('pointercancel', cancel); cleanup.current = undefined }
    const up = (event: PointerEvent) => { stop(); end(event) }
    const cancel = () => { stop(); setPending(undefined) }
    cleanup.current = stop
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', up)
    globalThis.addEventListener('pointercancel', cancel)
  }
  const pointAt = (event: { clientX: number; clientY: number }): CanvasPoint => {
    const bounds = surface.current!.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / props.zoom, y: (event.clientY - bounds.top) / props.zoom }
  }
  const dragLink = (event: ReactPointerEvent, from: string) => {
    event.stopPropagation(); event.preventDefault()
    if (event.button !== 0) return
    setPending({ from, point: pointAt(event) })
    track(move => setPending({ from, point: pointAt(move) }), up => {
      const target = document.elementFromPoint(up.clientX, up.clientY)?.closest<HTMLElement>('[data-node-id]')
      if (target?.dataset.nodeId !== undefined) connect(from, target.dataset.nodeId)
      else setPending(undefined)
    })
  }
  const drag = (event: ReactPointerEvent<HTMLElement | SVGPathElement>, id: string, origin: CanvasPoint) => {
    if (event.button !== 0) return
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY }
    track(move => props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + (move.clientX - start.x) / props.zoom, y: origin.y + (move.clientY - start.y) / props.zoom } }), () => {})
  }
  const remove = (from: string, to: string) => props.onCanvasLinksChange?.(links.filter(link => link[0] !== from || link[1] !== to))
  const arrow = (from: string, to: string) => {
    const a = positions[from]; const b = positions[to]
    if (!a || !b) return null
    const id = `edge:${from}:${to}`
    const start = { x: a.x + 180, y: a.y + 50 }; const end = { x: b.x, y: b.y + 50 }
    const control = props.canvas[id] ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
    const reset = () => { const next = { ...props.canvas }; delete next[id]; props.onCanvasChange(next) }
    return <g key={id} data-active={selectedEdge === id || undefined}>
      <path className="oh-story-canvas-edge" markerEnd="url(#oh-story-canvas-arrowhead)" d={path} />
      <path className="oh-story-canvas-edge-hit" data-edge-id={id} role="button" tabIndex={0} aria-label={`拖动箭头 ${from} 到 ${to}；Delete 删除，方向键微调，Esc 复位`} d={path}
        onPointerDown={event => { setSelectedEdge(id); props.onSelect(to); drag(event, id, control) }}
        onKeyDown={event => {
          const step = event.shiftKey ? 40 : 10
          const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined
          if (delta) { event.preventDefault(); props.onCanvasChange({ ...props.canvas, [id]: { x: control.x + delta[0]!, y: control.y + delta[1]! } }) }
          else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(from, to) }
          else if (event.key === 'Escape') reset()
        }} onDoubleClick={reset} />
      <circle className="oh-story-canvas-edge-handle" cx={control.x} cy={control.y} r="5" />
    </g>
  }
  return <section className="oh-story-canvas-shell" aria-label={copy.title} onKeyDown={event => { if (event.key === 'Escape') { cleanup.current?.(); setPending(undefined) } }}>
    <div className="oh-story-projection-note">{copy.note}</div>
    <div className="oh-story-canvas-controls">
      <button type="button" aria-label="缩小画布" onClick={() => props.onZoomChange(Math.max(.5, props.zoom - .1))}>−</button><span>{Math.round(props.zoom * 100)}%</span>
      <button type="button" aria-label="放大画布" onClick={() => props.onZoomChange(Math.min(1.8, props.zoom + .1))}>＋</button>
      <button type="button" onClick={() => { props.onCanvasChange({}); props.onZoomChange(.65) }}>{copy.reset}</button>
      {pending && <button type="button" onClick={() => setPending(undefined)}>{copy.cancel}</button>}
      {selectedEdge && <button type="button" onClick={() => { const link = links.find(([a,b]) => `edge:${a}:${b}` === selectedEdge); if (link) remove(...link); setSelectedEdge(undefined) }}>删除所选连线</button>}
    </div>
    {nodes.length === 0 ? <p>{copy.empty}</p> : <div className="oh-story-canvas-viewport"><div ref={surface} className="oh-story-canvas" style={{ transform: `scale(${props.zoom})`, minHeight: Math.max(1000, ...Object.values(positions).map(point => point.y + 200)), minWidth: Math.max(1200, ...Object.values(positions).map(point => point.x + 300)) }}>
      <svg><defs><marker id="oh-story-canvas-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" /></marker></defs>
        {links.map(([from, to]) => arrow(from, to))}
        {pending?.point && positions[pending.from] && <path className="oh-story-canvas-edge" style={{ pointerEvents: 'none', strokeDasharray: '8 5' }} markerEnd="url(#oh-story-canvas-arrowhead)" d={`M ${positions[pending.from]!.x + 180} ${positions[pending.from]!.y + 50} L ${pending.point.x} ${pending.point.y}`} />}
      </svg>
      {nodes.map(node => <article key={node.id} tabIndex={0} data-node-id={node.id} data-node-type={node.type} aria-label={`${node.type === 'asset' ? '素材' : '镜头'} ${node.label}`} data-selected={node.id === props.selectedId || undefined}
        style={{ left: positions[node.id]!.x, top: positions[node.id]!.y, touchAction: 'none' }}
        onPointerDown={event => drag(event, node.id, positions[node.id]!)}
        onDoubleClick={() => { const target = props.production.targets.get(node.id); if (target) props.onNavigate(target) }}
        onKeyDown={event => { if (event.target !== event.currentTarget) return; const step = event.shiftKey ? 40 : 10; const delta = event.key === 'ArrowLeft' ? [-step,0] : event.key === 'ArrowRight' ? [step,0] : event.key === 'ArrowUp' ? [0,-step] : event.key === 'ArrowDown' ? [0,step] : undefined; if (delta) { event.preventDefault(); props.onCanvasChange({ ...props.canvas, [node.id]: { x: positions[node.id]!.x + delta[0]!, y: positions[node.id]!.y + delta[1]! } }) } }}>
        <button type="button" className="oh-story-canvas-port" data-port="in" style={{ left: -12 }} aria-label={`${copy.input} ${node.id}`} title={copy.input} onPointerDown={event => event.stopPropagation()} onClick={() => { if (pending) connect(pending.from, node.id) }}>●</button>
        <small>{node.type === 'asset' ? '素材' : '镜头'}</small><strong>{node.label}</strong><span>{node.id}</span>
        <button type="button" className="oh-story-canvas-port" data-port="out" style={{ right: -12 }} aria-label={`${copy.output} ${node.id}`} title={copy.output} onPointerDown={event => dragLink(event, node.id)} onClick={event => { event.stopPropagation(); setPending({ from: node.id }) }}>➜</button>
      </article>)}
    </div></div>}
  </section>
}
