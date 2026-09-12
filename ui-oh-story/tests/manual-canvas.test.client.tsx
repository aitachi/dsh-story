// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ManualCanvas, type CanvasLink } from '../src/client/manual-canvas.js'
import { parseEpisodeProduction } from '../src/client/drama-production.js'
import type { Props } from '../src/client/drama-production-view.js'

it('creates one-to-many and many-to-one links by pointer, rejects duplicates and self links, deletes with keyboard', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const production = parseEpisodeProduction({
    '剧集/EP001/图片提示词.md': '## IMG-A · A\n### 可复制提示词\n> A\n## IMG-B · B\n### 可复制提示词\n> B',
    '剧集/EP001/分镜.md': '## SHOT-EP001-001 · One\n### 冻结关键帧提示词\n> One\n## SHOT-EP001-002 · Two\n### 冻结关键帧提示词\n> Two',
  }, '剧集/EP001')
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const updated = vi.fn()
  function Harness() {
    const [links, setLinks] = useState<CanvasLink[]>([])
    return <ManualCanvas {...({ production, canvas: {}, zoom: .65, onCanvasChange: vi.fn(), onZoomChange: vi.fn(), onSelect: vi.fn(), onNavigate: vi.fn() } as unknown as Props)} canvasLinks={links} onCanvasLinksChange={next => { updated(next); setLinks(next) }} />
  }
  act(() => root.render(<Harness />))
  const drag = (from: string, to: string) => {
    const source = container.querySelector(`[data-node-id="${from}"] [data-port="out"]`)!
    const target = container.querySelector(`[data-node-id="${to}"]`)!
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
    act(() => source.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 })))
    act(() => globalThis.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 200 })))
    act(() => globalThis.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 200 })))
  }
  drag('IMG-A', 'SHOT-EP001-001'); drag('IMG-A', 'SHOT-EP001-002'); drag('IMG-B', 'SHOT-EP001-001')
  expect(container.querySelectorAll('[data-edge-id]')).toHaveLength(3)
  expect(updated).toHaveBeenLastCalledWith([['IMG-A','SHOT-EP001-001'],['IMG-A','SHOT-EP001-002'],['IMG-B','SHOT-EP001-001']])
  drag('IMG-A','SHOT-EP001-001'); drag('IMG-A','IMG-A')
  expect(updated).toHaveBeenCalledTimes(3)
  act(() => container.querySelector('[data-edge-id]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })))
  expect(container.querySelectorAll('[data-edge-id]')).toHaveLength(2)
  act(() => root.unmount()); container.remove()
})
