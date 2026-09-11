import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { createOhStoryProductionTool } from '../src/production-tool.js'
import { OH_STORY_PRODUCTION_TOOL_NAME, validateProductionIntent } from '../src/production-intent.js'

describe('native short-drama production intent tool', () => {
  it('validates semantic focus, sequence and tracked-job intents', () => {
    expect(validateProductionIntent({
      action: 'focus_target',
      episode: '剧集/EP001/',
      targetId: 'SHOT-EP001-008',
      section: 'shots',
    })).toEqual({ action: 'focus_target', episode: '剧集/EP001', targetId: 'SHOT-EP001-008', section: 'shots' })
    expect(validateProductionIntent({
      action: 'set_sequence',
      episode: '剧集/EP002',
      shotIds: ['SHOT-EP002-002', 'SHOT-EP002-001'],
    }).shotIds).toEqual(['SHOT-EP002-002', 'SHOT-EP002-001'])
    expect(() => validateProductionIntent({ action: 'focus_target', episode: '../EP001', targetId: 'SHOT-001' })).toThrow(/剧集\/EP001/u)
    expect(() => validateProductionIntent({ action: 'focus_target', episode: '剧集/EP001', targetId: '' })).toThrow(/targetId/u)
    expect(() => validateProductionIntent({ action: 'set_sequence', episode: '剧集/EP001', shotIds: ['SHOT-A', 'SHOT-A'] })).toThrow(/unique/u)
  })

  it('returns a canonical projection result without touching media or files', async () => {
    const tool = createOhStoryProductionTool()
    expect(tool.name).toBe(OH_STORY_PRODUCTION_TOOL_NAME)
    const result = await tool.execute({
      action: 'track_job',
      episode: '剧集/EP001',
      targetId: 'SHOT-EP001-003',
      jobId: 'agent-job-003',
      jobKind: 'video',
      expectedOutputs: 1,
      prompt: '从冻结关键帧开始运动',
    }, {} as ToolRunContext)
    expect(result).toEqual(expect.objectContaining({ action: 'track_job', episode: '剧集/EP001' }))
  })
})
