import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { defaultBundledSkillRoot } from "@oh-story/skills";
import { fileURLToPath } from "node:url";
//#region lib/types/reference-tool.js
const OH_STORY_REFERENCE_TOOL_NAME = "oh_story_bundled_reference";
async function collectMarkdown(root, directory = root) {
	const entries = await readdir(directory, { withFileTypes: true });
	return (await Promise.all(entries.map(async (entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return collectMarkdown(root, path);
		return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
	}))).flat();
}
async function bundledReferences(storySetupRoot) {
	const root = await realpath(resolve(storySetupRoot));
	const referenceRoot = await realpath(join(root, "references", "agent-references"));
	const referenceDirectory = relative(root, referenceRoot);
	if (referenceDirectory === "" || referenceDirectory.startsWith("..") || isAbsolute(referenceDirectory)) throw new Error("Bundled Oh Story reference directory escaped its package root.");
	return (await Promise.all((await collectMarkdown(referenceRoot)).map(async (path) => {
		const canonicalPath = await realpath(path);
		const inside = relative(referenceRoot, canonicalPath);
		if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`Bundled Oh Story reference escaped its package root: ${path}`);
		return {
			canonicalPath,
			name: `story-setup/references/agent-references/${inside.replaceAll("\\", "/")}`
		};
	}))).sort((left, right) => left.name.localeCompare(right.name));
}
async function createOhStoryReferenceTool(storySetupRoot = join(defaultBundledSkillRoot(), "story-setup")) {
	const references = await bundledReferences(storySetupRoot);
	if (references.length === 0) throw new Error("No bundled Oh Story references were found.");
	const paths = references.map((reference) => reference.name);
	const byName = new Map(references.map((reference) => [reference.name, reference.canonicalPath]));
	return defineTool({
		name: OH_STORY_REFERENCE_TOOL_NAME,
		description: "Read one exact, pinned Oh Story story-setup reference bundled with this plugin. This does not resolve project Skills or workspace files.",
		parameters: { reference: {
			type: "string",
			required: true,
			enum: paths,
			description: "The exact story-setup reference path named by the active bundled Role."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					reference: {
						type: "string",
						required: true
					},
					content: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Bundled Oh Story reference: ${value.reference}\n\n${value.content}`
			}]
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const path = byName.get(args.reference);
			if (path === void 0) throw new Error(`Oh Story reference is not bundled: ${args.reference}`);
			return {
				reference: args.reference,
				content: await readFile(path, "utf8")
			};
		}
	});
}
/** Deny a scoped same-name replacement instead of executing untrusted reference code. */
function bundledReferenceGuard(definition, tools) {
	return (execution) => execution.name === "oh_story_bundled_reference" && tools.get("oh_story_bundled_reference", execution.agent) !== definition ? "The pinned Oh Story reference tool was shadowed in this Agent scope." : void 0;
}
//#endregion
//#region lib/types/role-provider.js
const OH_STORY_ROLE_NAMES = [
	"chapter-extractor",
	"character-designer",
	"consistency-checker",
	"narrative-writer",
	"story-architect",
	"story-explorer",
	"story-researcher"
];
function roleBody(source) {
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u.exec(source);
	return source.slice(frontmatter?.[0].length ?? 0).trim();
}
function defaultBundledRoleRoot() {
	const current = dirname(fileURLToPath(import.meta.url));
	return basename(current) === "src" ? resolve(current, "../knowledge/oh-story/roles") : resolve(current, "oh-story/roles");
}
async function loadBundledRole(name, roleRoot = defaultBundledRoleRoot(), execution = "tool-free") {
	const body = roleBody(await readFile(join(resolve(roleRoot), `${name}.md`), "utf8"));
	if (body.length === 0) throw new Error(`Bundled role "${name}" is empty.`);
	const integration = execution === "tool-free" ? [
		"You are running inside an Oh Story review-required DSH collaboration. The caller supplies every permitted input in the prompt.",
		"Do not read or write project files, do not call tools, and do not follow legacy .claude/.codex path or deployment instructions in the upstream role text.",
		"Return only the output contract requested by the caller; never claim to have changed the project."
	] : [
		"You are running as a native oh-story-dsh specialist. The current DSH workspace and visible tool set are your complete authority boundary.",
		"Never inspect or require legacy .claude/.opencode/.codex agent deployment files; this exact pinned Role is already active.",
		"Bundled story-setup references are pinned plugin resources, not project files or project Skills. When the upstream Role marks one mandatory, call oh_story_bundled_reference with the exact story-setup/references/agent-references path, then use only the returned content.",
		"If oh_story_bundled_reference or a required bundled reference is unavailable, report the missing reference to the caller. Never call the generic skill tool, fall back to a legacy platform path, or claim that an unread reference was used.",
		"Use only the tools actually visible to you. Mutate files only when the caller explicitly requests it and your visible DSH tools permit it; otherwise return findings to the caller."
	];
	return [
		`OH_STORY_DSH_ROLE:${name}`,
		...integration,
		"",
		body
	].join("\n");
}
//#endregion
//#region lib/types/role-tool.js
const OH_STORY_ROLE_TOOL_NAME = "oh_story_role";
const roleTools = {
	"chapter-extractor": [
		"read",
		"glob",
		"grep"
	],
	"character-designer": [
		OH_STORY_REFERENCE_TOOL_NAME,
		"read",
		"glob",
		"grep",
		"write",
		"edit"
	],
	"consistency-checker": [
		OH_STORY_REFERENCE_TOOL_NAME,
		"read",
		"glob",
		"grep"
	],
	"narrative-writer": [
		OH_STORY_REFERENCE_TOOL_NAME,
		"read",
		"glob",
		"grep",
		"write",
		"edit",
		"bash"
	],
	"story-architect": [
		OH_STORY_REFERENCE_TOOL_NAME,
		"read",
		"glob",
		"grep",
		"write",
		"edit"
	],
	"story-explorer": [
		"read",
		"glob",
		"grep"
	],
	"story-researcher": [
		"read",
		"glob",
		"grep",
		"bash",
		"write",
		"web_search",
		"web_fetch"
	]
};
function roleToolFilter(role) {
	return { allow: roleTools[role] };
}
function resultText(output) {
	return output.map((block) => block.type === "text" ? block.text : JSON.stringify(block)).join("\n");
}
async function createOhStoryRoleTool(subagents) {
	const personas = /* @__PURE__ */ new Map();
	await Promise.all(OH_STORY_ROLE_NAMES.map(async (role) => {
		personas.set(role, await loadBundledRole(role, void 0, "native-tools"));
	}));
	return defineTool({
		name: OH_STORY_ROLE_TOOL_NAME,
		description: "Run one focused Oh Story specialist as a child of the current DSH Agent. The child inherits DSH model, workspace, permissions, lifecycle, and UI.",
		parameters: {
			role: {
				type: "string",
				required: true,
				enum: OH_STORY_ROLE_NAMES,
				description: "The exact Oh Story Role to run."
			},
			prompt: {
				type: "string",
				required: true,
				description: "A self-contained task. The child inherits the current DSH workspace but not the current in-flight turn."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					role: {
						type: "string",
						required: true,
						enum: OH_STORY_ROLE_NAMES
					},
					runId: {
						type: "string",
						required: true
					},
					content: {
						type: "array",
						required: true,
						items: { type: "json" }
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: resultText(value.content)
			}]
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			if (exec.agent === void 0) throw new Error("oh_story_role requires a calling DSH Agent.");
			const persona = personas.get(args.role);
			if (persona === void 0) throw new Error(`Oh Story Role ${args.role} is not bundled.`);
			const allowed = roleToolFilter(args.role).allow.filter((name) => exec.agent?.ctx.tools.get(name, exec.agent) !== void 0);
			const runtime = subagents ?? exec.agent.ctx.get("subagents");
			if (runtime === void 0) throw new Error("oh_story_role requires the DSH subagent runtime.");
			const run = await runtime.start("spawn", {
				label: `oh-story:${args.role}`,
				prompt: [{
					type: "text",
					text: args.prompt
				}],
				parent: exec.agent,
				persona,
				toolFilter: { allow: allowed },
				maxDepth: 1,
				signal: exec.signal
			});
			try {
				const result = await run.result;
				if (result.stopReason !== "completed") throw new Error(`Oh Story Role ${args.role} ended with ${result.stopReason}${result.diagnostic === void 0 ? "" : `: ${result.diagnostic}`}`);
				return {
					role: args.role,
					runId: run.id,
					content: result.output
				};
			} finally {
				await run.dispose();
			}
		}
	});
}
async function registerOhStoryRoleTool(context) {
	const [definition, referenceDefinition] = await Promise.all([createOhStoryRoleTool(context.subagents), createOhStoryReferenceTool()]);
	context.tools.register(referenceDefinition);
	context.tools.guard(bundledReferenceGuard(referenceDefinition, context.tools));
	let dispose;
	const mount = () => {
		dispose ??= context.tools.register(definition);
	};
	const unmount = () => {
		dispose?.();
		dispose = void 0;
	};
	context.on("subagent/provider-added", (provider) => {
		if (provider.name === "spawn") mount();
	});
	context.on("subagent/provider-removed", (name) => {
		if (name === "spawn") unmount();
	});
	if (context.subagents.getProvider("spawn") !== void 0) mount();
}
//#endregion
//#region lib/types/index.js
/** Host registration: the bundled Oh Story specialist Roles and the oh_story_role tool. */
const name = "oh-story-roles";
const inject = ["subagents", "tools"];
/** Mount only domain contributions into the current DSH process. */
async function apply(context) {
	await registerOhStoryRoleTool(context);
}
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { OH_STORY_REFERENCE_TOOL_NAME, OH_STORY_ROLE_NAMES, OH_STORY_ROLE_TOOL_NAME, apply, bundledReferenceGuard, createOhStoryReferenceTool, createOhStoryRoleTool, types_default as default, inject, loadBundledRole, name, registerOhStoryRoleTool, roleToolFilter };
