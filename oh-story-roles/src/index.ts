/** Host registration: the bundled Oh Story specialist Roles and the oh_story_role tool. */

import type { Context } from '@deepseek-ai/cordis'
import { registerOhStoryRoleTool } from './role-tool.js'

export { OH_STORY_ROLE_NAMES, loadBundledRole } from './role-provider.js'
export {
  createOhStoryRoleTool,
  OH_STORY_ROLE_TOOL_NAME,
  registerOhStoryRoleTool,
  roleToolFilter,
  type OhStoryRoleSubagents,
} from './role-tool.js'
export { bundledReferenceGuard, createOhStoryReferenceTool, OH_STORY_REFERENCE_TOOL_NAME } from './reference-tool.js'

export const name = 'oh-story-roles'
export const inject = ['subagents', 'tools']

/** Mount only domain contributions into the current DSH process. */
export async function apply(context: Context): Promise<void> {
  await registerOhStoryRoleTool(context)
}

export default { name, inject, apply }
