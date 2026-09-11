/** Host registration: the /oh-story creative workspace editor API and its tools. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerOhStoryProductionTool } from './production-tool.js'
import { registerWorkspaceRoute } from './workspace-route.js'
import { assertTrustedWorkspaceAuthority } from './workspace-request-trust.js'

export { registerWorkspaceRoute } from './workspace-route.js'
export { registerOhStoryHooks } from './native-hooks.js'
export { createOhStoryProductionTool, registerOhStoryProductionTool } from './production-tool.js'
export { OH_STORY_PRODUCTION_TOOL_NAME, validateProductionIntent, type ProductionIntentArgs } from './production-intent.js'

/** DSH owns models, providers, presets, permissions, roots, runs, and sessions. */
export interface Config {
  readonly editorMaxBytes?: number
  readonly trustedHosts?: string[]
}

export const Config = z.object({
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  trustedHosts: z.array(String).default([]),
}) as z<Config>

export const name = 'oh-story-workspace'
export const inject = ['tools', 'typert', 'webServer']

/** Mount only domain contributions into the current DSH process. */
export async function apply(context: Context, config: Config = {}): Promise<void> {
  const trustedHosts = config.trustedHosts ?? []
  for (const entry of trustedHosts) assertTrustedWorkspaceAuthority(entry)
  registerOhStoryProductionTool(context)
  registerWorkspaceRoute(context, { maxBytes: config.editorMaxBytes ?? 2_097_152, trustedHosts })
}

export default { name, inject, Config, apply }
