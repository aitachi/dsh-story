// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CanvasDocument } from '../src/client/canvas-document.js'
import { parseEpisodeProduction } from '../src/client/drama-production.js'
import type { Props } from '../src/client/drama-production-view.js'

vi.mock('../src/client/drama-production-view.js', () => ({ DramaProductionView: (props: Props) => <button onClick={() => props.onCanvasLinksChange?.([['IMG-A','SHOT-EP001-001']])}>连接</button> }))
it('loads server graph, writes against its version and visibly blocks conflicting edits', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ state: null, version: null }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'v1' }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: '文件已在磁盘上更新' }) })
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const production = parseEpisodeProduction({}, '剧集/EP001')
  try {
    await act(async () => root.render(<CanvasDocument {...({ production, sessionId: 'session-test', canvas: {} } as unknown as Props & {sessionId: string})} />))
    await act(async () => container.querySelector('button')!.click())
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ state: { positions: {}, links: [['IMG-A','SHOT-EP001-001']] }, version: null })
    expect(container.textContent).toContain('画布已保存')
    await act(async () => container.querySelector('button')!.click())
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body).version).toBe('v1')
    expect(container.textContent).toContain('重新读取')
    expect(container.textContent).not.toContain('连接')
  } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() }
})
