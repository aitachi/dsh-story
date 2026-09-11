import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { describe, expect, it } from 'vitest'
import { settledProductionIntents } from '../src/client/production-intents.js'
import { OH_STORY_PRODUCTION_TOOL_NAME } from '../src/client/production-intent.js'

describe('short-drama production intent projection', () => {
  it('replays only durable successful DSH tool calls in Chat order', () => {
    const block = (callId: string, argsRaw: string, isError = false) => ({
      kind: 'tool-result',
      callId,
      isError,
      call: { name: OH_STORY_PRODUCTION_TOOL_NAME, argsRaw },
      content: [],
      subCalls: [],
    })
    const nodes = [
      { key: 'tool:1', kind: 'tool-call', data: { root: block('intent-1', JSON.stringify({ action: 'open_section', episode: '剧集/EP001', section: 'assets' })) } },
      { key: 'tool:2', kind: 'tool-call', data: { root: block('intent-2', JSON.stringify({ action: 'focus_target', episode: '剧集/EP001', targetId: 'SHOT-002' }), true) } },
      { key: 'tool:3', kind: 'tool-call', data: { root: block('intent-3', '{bad') } },
    ]
    const chat = {
      order: nodes.map(node => node.key),
      nodes: { get: (key: string) => nodes.find(node => node.key === key) },
    } as unknown as ChatSnapshot
    expect(settledProductionIntents(chat)).toEqual([{
      callId: 'intent-1',
      intent: { action: 'open_section', episode: '剧集/EP001', section: 'assets' },
    }])
  })
})
