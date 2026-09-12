import { useEffect, useRef, useState } from 'react'
import { DramaProductionView, type Props } from './drama-production-view.js'
import type { CanvasState } from './manual-canvas.js'

/** Project-owned canvas document, serialized optimistic writes with visible conflict recovery. */
export function CanvasDocument(props: Props & { sessionId: string }) {
  const [state, setState] = useState<CanvasState | null>(null)
  const [status, setStatus] = useState('正在读取画布…')
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const io = useRef<{ version: string | null; pending?: CanvasState; busy: boolean; failed: boolean; active: boolean }>({ version: null, busy: false, failed: false, active: true })
  const url = `/oh-story/canvas?sessionId=${encodeURIComponent(props.sessionId)}&path=${encodeURIComponent(props.production.episodeDirectory)}`
  useEffect(() => {
    const current = { version: null as string | null, busy: false, failed: false, active: true }
    io.current = current
    setReady(false)
    void fetch(url).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '画布读取失败')
      if (!current.active) return
      if (data.state !== null && (!Array.isArray(data.state?.links) || typeof data.state?.positions !== 'object' || data.state.positions === null)) throw new Error('画布文件格式错误')
      current.version = data.version
      setState(data.state); setReady(true); setStatus('画布已同步')
    }).catch(error => { if (current.active) { current.failed = true; setStatus(String(error)) } })
    return () => { current.active = false }
  }, [url, revision])
  const save = (next: CanvasState) => {
    const current = io.current
    if (!ready || current.failed) return
    setState(next); current.pending = next
    if (current.busy) return
    current.busy = true
    setStatus('正在保存画布…')
    void (async () => {
      try {
        while (current.pending !== undefined) {
          const submitted = current.pending; delete current.pending
          const response = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: submitted, version: current.version }) })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error ?? '画布保存失败')
          current.version = data.version
        }
        if (current.active) setStatus('画布已保存到剧集目录')
      } catch (error) {
        current.failed = true
        if (current.active) { setReady(false); setStatus(`${String(error)}；请重新读取后再编辑，未保存的更改不会覆盖服务器文件。`) }
      } finally { current.busy = false }
    })()
  }
  const links = state?.links ?? props.production.shots.flatMap(shot => shot.references.map(reference => [reference, shot.id] as const))
  const positions = state?.positions ?? props.canvas
  // Only incoming asset links are generation references; other links are visual organization.
  const assetIds = new Set([...props.production.assets, ...props.production.visualAssets].map(asset => asset.id))
  const production = state === null ? props.production : { ...props.production, shots: props.production.shots.map(shot => ({ ...shot, references: links.filter(([from,to]) => to === shot.id && assetIds.has(from)).map(([from]) => from) })) }
  return <><div role="status">{status}{!ready && <button type="button" onClick={() => setRevision(value => value + 1)}>重新读取画布</button>}</div>
    {ready && <DramaProductionView {...props} production={production} canvas={positions} canvasLinks={links}
      onCanvasChange={next => save({ positions: next, links: [...links] })}
      onCanvasLinksChange={next => save({ positions: { ...positions }, links: next })} />}
  </>
}
