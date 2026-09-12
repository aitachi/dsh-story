// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseEpisodeProduction } from '../src/client/drama-production.js'
import { DramaProductionView } from '../src/client/drama-production-view.js'

const episode = '剧集/EP001'
const production = parseEpisodeProduction({
  [`${episode}/分镜.md`]: `## SHOT-EP001-001 · 门外停步
- 图片提示词项：IMG-OLD-DOOR《旧门场景板》
### 冻结关键帧提示词
> 旧门外的人物停步。
`,
  [`${episode}/图片提示词.md`]: `## IMG-OLD-DOOR · 旧门场景板
### 可复制提示词
> 旧木门，黄铜门把。
`,
}, episode)

describe('production canvas arrows', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    act(() => { root.unmount() })
    container.remove()
  })

  it('renders a vector arrow and persists its dragged control point', () => {
    const onCanvasChange = vi.fn()
    const onSelect = vi.fn()
    act(() => {
      root.render(<DramaProductionView
        production={production}
        sessionRunning={false}
        queue={[]}
        section="canvas"
        selectedId={undefined}
        jobs={[]}
        versions={[]}
        libraryVersions={[]}
        selections={{}}
        manualReferences={{}}
        sequence={[]}
        canvas={{}}
        zoom={1}
        onSectionChange={vi.fn()}
        onSelect={onSelect}
        onNavigate={vi.fn()}
        onJobsChange={vi.fn()}
        onSelectionsChange={vi.fn()}
        onManualReferencesChange={vi.fn()}
        onOpenMedia={vi.fn()}
        onSequenceChange={vi.fn()}
        onCanvasChange={onCanvasChange}
        onZoomChange={vi.fn()}
        onDispatchPrompt={vi.fn()}
        onCancelTurn={vi.fn()}
        onRemoveQueued={vi.fn()}
        onRefresh={vi.fn()}
      />)
    })

    const arrow = container.querySelector<SVGPathElement>('[role="button"][aria-label^="拖动箭头"]')
    expect(arrow).not.toBeNull()
    expect(container.querySelector('.oh-story-canvas-edge')?.getAttribute('marker-end')).toBe('url(#oh-story-canvas-arrowhead)')

    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 450, clientY: 130 })
    Object.defineProperty(down, 'pointerId', { value: 1 })
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 470, clientY: 160 })
    act(() => {
      arrow!.dispatchEvent(down)
      globalThis.dispatchEvent(move)
    })
    globalThis.dispatchEvent(new MouseEvent('pointerup'))

    expect(onSelect).toHaveBeenCalledWith('SHOT-EP001-001')
    expect(onCanvasChange).toHaveBeenLastCalledWith({
      'edge:IMG-OLD-DOOR:SHOT-EP001-001': { x: 470, y: 160 },
    })
  })

  it('supports keyboard adjustment for the same arrow handle', () => {
    const onCanvasChange = vi.fn()
    act(() => {
      root.render(<DramaProductionView
        production={production}
        sessionRunning={false}
        queue={[]}
        section="canvas"
        selectedId={undefined}
        jobs={[]}
        versions={[]}
        libraryVersions={[]}
        selections={{}}
        manualReferences={{}}
        sequence={[]}
        canvas={{}}
        zoom={1}
        onSectionChange={vi.fn()}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
        onJobsChange={vi.fn()}
        onSelectionsChange={vi.fn()}
        onManualReferencesChange={vi.fn()}
        onOpenMedia={vi.fn()}
        onSequenceChange={vi.fn()}
        onCanvasChange={onCanvasChange}
        onZoomChange={vi.fn()}
        onDispatchPrompt={vi.fn()}
        onCancelTurn={vi.fn()}
        onRemoveQueued={vi.fn()}
        onRefresh={vi.fn()}
      />)
    })

    const arrow = container.querySelector<SVGPathElement>('[role="button"][aria-label^="拖动箭头"]')
    act(() => { arrow!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })) })
    expect(onCanvasChange).toHaveBeenLastCalledWith({
      'edge:IMG-OLD-DOOR:SHOT-EP001-001': { x: 450, y: 140 },
    })
  })
})
