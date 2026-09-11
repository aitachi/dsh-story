import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { extname } from "node:path";
import { FsError } from "@deepseek-ai/dsh-fs";
import { SessionId } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
//#region lib/types/production-intent.js
const OH_STORY_PRODUCTION_TOOL_NAME = "oh_story_production";
const PRODUCTION_INTENT_ACTIONS = [
	"open_section",
	"focus_target",
	"set_sequence",
	"track_job"
];
const PRODUCTION_INTENT_SECTIONS = [
	"shots",
	"assets",
	"tasks",
	"sequence",
	"canvas"
];
const PRODUCTION_INTENT_JOB_KINDS = [
	"image",
	"video",
	"composition"
];
function requiredText(value, field) {
	const normalized = value?.trim();
	if (!normalized) throw new Error(`oh_story_production ${field} is required for this action.`);
	if (normalized.length > 512) throw new Error(`oh_story_production ${field} is too long.`);
	return normalized;
}
/** Validate the cross-runtime UI intent without reading or mutating workspace state. */
function validateProductionIntent(args) {
	const episode = args.episode.trim().replaceAll("\\", "/").replace(/\/$/u, "");
	if (!/^剧集\/EP\d{3,}$/u.test(episode)) throw new Error("oh_story_production episode must use the creator path form 剧集/EP001.");
	if (args.action === "open_section") {
		if (args.section === void 0) throw new Error("oh_story_production section is required for open_section.");
		return {
			action: args.action,
			episode,
			section: args.section
		};
	}
	if (args.action === "focus_target") return {
		action: args.action,
		episode,
		targetId: requiredText(args.targetId, "targetId"),
		section: args.section
	};
	if (args.action === "set_sequence") {
		const shotIds = args.shotIds?.map((value) => value.trim()).filter((value) => value !== "") ?? [];
		if (shotIds.length === 0) throw new Error("oh_story_production shotIds must contain at least one shot for set_sequence.");
		if (shotIds.length > 500 || new Set(shotIds).size !== shotIds.length || shotIds.some((value) => !/^SHOT-[A-Z0-9-]+$/u.test(value))) throw new Error("oh_story_production shotIds must be unique canonical SHOT-* identifiers.");
		return {
			action: args.action,
			episode,
			shotIds
		};
	}
	const expectedOutputs = args.expectedOutputs;
	if (expectedOutputs !== void 0 && (!Number.isInteger(expectedOutputs) || expectedOutputs < 1 || expectedOutputs > 500)) throw new Error("oh_story_production expectedOutputs must be an integer between 1 and 500.");
	if (args.jobKind === void 0) throw new Error("oh_story_production jobKind is required for track_job.");
	const prompt = args.prompt?.trim();
	return {
		action: args.action,
		episode,
		jobId: requiredText(args.jobId, "jobId"),
		targetId: requiredText(args.targetId, "targetId"),
		jobKind: args.jobKind,
		expectedOutputs,
		prompt: prompt === "" ? void 0 : prompt
	};
}
//#endregion
//#region lib/types/production-tool.js
function intentMessage(intent) {
	if (intent.action === "track_job") return `已把 ${intent.targetId ?? "生产对象"} 的 ${intent.jobKind ?? "媒体"} 任务投影到 ${intent.episode} 的任务板。`;
	if (intent.action === "set_sequence") return `已把 ${String(intent.shotIds?.length ?? 0)} 个镜头的顺序发送到 ${intent.episode} 成片视图。`;
	if (intent.action === "focus_target") return `已请求 ${intent.episode} 生产视图聚焦 ${intent.targetId ?? "目标"}。`;
	return `已把 ${intent.action} 界面意图发送到 ${intent.episode} 生产工作台。`;
}
function createOhStoryProductionTool() {
	return defineTool({
		name: OH_STORY_PRODUCTION_TOOL_NAME,
		description: "Operate the native oh-story short-drama production projection in the current DSH Session. It can open or focus semantic production targets, set an explicit shot order, or track a job the Agent is actually executing. It never controls cosmetic canvas layout, generates media, changes creator documents, or counts as creator confirmation for paid production.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: PRODUCTION_INTENT_ACTIONS,
				description: "The exact production UI/task projection operation."
			},
			episode: {
				type: "string",
				required: true,
				description: "Creator-first episode directory, for example 剧集/EP001."
			},
			section: {
				type: "string",
				enum: PRODUCTION_INTENT_SECTIONS
			},
			targetId: { type: "string" },
			shotIds: {
				type: "array",
				items: { type: "string" }
			},
			jobId: {
				type: "string",
				description: "Stable ID that must also appear in produced output filenames."
			},
			jobKind: {
				type: "string",
				enum: PRODUCTION_INTENT_JOB_KINDS
			},
			expectedOutputs: {
				type: "integer",
				description: "Number of media files this job will produce. Repeat the count the creator approved when re-registering a batch; omit it to keep the count the workbench already recorded."
			},
			prompt: {
				type: "string",
				description: "Exact prompt/specification for a tracked job; not a production authorization."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					action: {
						type: "string",
						required: true,
						enum: PRODUCTION_INTENT_ACTIONS
					},
					episode: {
						type: "string",
						required: true
					},
					message: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.message
			}]
		},
		isConcurrencySafe: () => true,
		execute(args) {
			const intent = validateProductionIntent(args);
			return Promise.resolve({
				action: intent.action,
				episode: intent.episode,
				message: intentMessage(intent)
			});
		}
	});
}
function registerOhStoryProductionTool(context) {
	context.tools.register(createOhStoryProductionTool());
}
//#endregion
//#region lib/types/workspace-request-trust.js
function header(headers, name) {
	if (headers instanceof Headers) return headers.get(name) ?? void 0;
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
function canonicalAuthority(entry, url) {
	const port = url.port !== "" ? url.port : new URL(`https://${entry}`).port;
	return port === "" ? url.hostname : `${url.hostname}:${port}`;
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}
function isTrustedAuthority(host, trustedHosts) {
	return trustedHosts.some((entry) => {
		const candidate = parseAuthority(entry);
		if (candidate === void 0) return false;
		return canonicalAuthority(entry, candidate) === candidate.hostname ? candidate.hostname === host.hostname : candidate.host === host.host;
	});
}
/** Reject malformed declarations at plugin load instead of silently widening access. */
function assertTrustedWorkspaceAuthority(entry) {
	const url = parseAuthority(entry);
	if (url !== void 0 && canonicalAuthority(entry, url) === entry.toLocaleLowerCase()) return;
	throw new Error(`oh-story: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`);
}
/**
* Same browser trust boundary as DSH's native API: every request must address a
* loopback or explicitly trusted Host, and browser markers must be same-origin.
*/
function isTrustedWorkspaceRequest(request, trustedHosts) {
	const authority = header(request.headers, "host");
	if (authority === void 0) return false;
	const host = parseAuthority(authority);
	if (host === void 0) return false;
	if (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === host.host;
	} catch {
		return false;
	}
}
//#endregion
//#region lib/types/workspace-route.js
const STORY_DIRECTORIES = [
	"正文",
	"大纲",
	"设定",
	"追踪",
	"对标",
	"参考资料"
];
const DRAMA_DIRECTORIES = [
	"输入",
	"项目开发",
	"设定集",
	"剧集",
	"交付",
	"创作者决策",
	"审查"
];
const CREATIVE_DIRECTORIES = [...STORY_DIRECTORIES, ...DRAMA_DIRECTORIES];
const ROOT_FILES = new Set(["short-drama.json"]);
const EDITABLE_EXTENSIONS = new Set([
	".md",
	".txt",
	".json",
	".jsonl"
]);
const MEDIA_TYPES = new Map([
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".webp", "image/webp"],
	[".gif", "image/gif"],
	[".mp4", "video/mp4"],
	[".webm", "video/webm"],
	[".mov", "video/quicktime"],
	[".mp3", "audio/mpeg"],
	[".wav", "audio/wav"],
	[".m4a", "audio/mp4"]
]);
const MEDIA_MAX_BYTES = 256 * 1024 * 1024;
const FILE_LIMIT = 1e3;
var WorkspaceHttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
function send(response, status, value) {
	const body = `${JSON.stringify(value)}\n`;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	response.end(body);
}
function sendMedia(request, response, bytes, mimeType) {
	const range = request.headers.range;
	let start = 0;
	let end = bytes.byteLength - 1;
	let status = 200;
	if (typeof range === "string") {
		const match = /^bytes=(\d*)-(\d*)$/u.exec(range.trim());
		if (match !== null) {
			const requestedStart = match[1] === "" ? 0 : Number(match[1]);
			const requestedEnd = match[2] === "" ? end : Number(match[2]);
			if (Number.isSafeInteger(requestedStart) && Number.isSafeInteger(requestedEnd) && requestedStart >= 0 && requestedStart <= requestedEnd && requestedStart < bytes.byteLength) {
				start = requestedStart;
				end = Math.min(requestedEnd, end);
				status = 206;
			}
		}
	}
	const body = bytes.subarray(start, end + 1);
	response.writeHead(status, {
		"content-type": mimeType,
		"content-length": body.byteLength,
		"cache-control": "private, max-age=60",
		"accept-ranges": "bytes",
		...status === 206 ? { "content-range": `bytes ${String(start)}-${String(end)}/${String(bytes.byteLength)}` } : {},
		"x-content-type-options": "nosniff"
	});
	response.end(Buffer.from(body));
}
async function jsonBody(request, maxBytes) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const value = Buffer.from(chunk);
		size += value.byteLength;
		if (size > maxBytes) throw new WorkspaceHttpError(413, "请求内容过大。");
		chunks.push(value);
	}
	try {
		const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
		return value;
	} catch {
		throw new WorkspaceHttpError(400, "请求必须是 JSON 对象。");
	}
}
function safeRelativePath(path) {
	return path !== "" && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}
function editablePath(path) {
	return EDITABLE_EXTENSIONS.has(extname(path).toLocaleLowerCase());
}
function assertCreativePath(path, kind) {
	if (kind === "text" ? !editablePath(path) : !MEDIA_TYPES.has(extname(path).toLocaleLowerCase())) throw new WorkspaceHttpError(415, kind === "text" ? "工作台不支持编辑该文件类型。" : "目标不是受支持的短剧媒体文件。");
	if (!safeRelativePath(path)) throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
	const root = path.split("/", 1)[0];
	if (!CREATIVE_DIRECTORIES.some((directory) => directory === root) && !ROOT_FILES.has(path)) throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
}
function mediaMimeTypeForPath(path) {
	return MEDIA_TYPES.get(extname(path).toLocaleLowerCase());
}
async function workspaceRealmForSession(context, rawId) {
	if (rawId === "") throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
	const lookup = context.typert.lookups.get("agent");
	if (lookup === void 0) throw new WorkspaceHttpError(503, "DSH Agent lookup 当前不可用。");
	let agent;
	try {
		agent = await lookup.resolve(SessionId(rawId));
	} catch {
		throw new WorkspaceHttpError(404, "DSH 会话不可用。");
	}
	if (agent === void 0) throw new WorkspaceHttpError(404, "DSH 会话不可用。");
	if (agent.session.header.parentSession !== void 0 || agent.session.header.origin === "subagent") throw new WorkspaceHttpError(403, "子 Agent 会话不开放创作编辑器。");
	const cwd = agent.session.header.cwd;
	if (cwd === void 0) throw new WorkspaceHttpError(409, "当前 DSH 会话没有工作目录。");
	const fs = agent.ctx.get("fs");
	const sandboxPolicy = agent.ctx.get("sandboxPolicy");
	if (fs === void 0 || sandboxPolicy === void 0) throw new WorkspaceHttpError(503, "DSH 文件系统当前不可用。");
	return {
		agent,
		fs,
		sandboxPolicy,
		cwd,
		root: await fs.resolve(cwd)
	};
}
async function workspaceRealm(context, url) {
	const rawId = url.searchParams.get("sessionId");
	if (rawId === null) throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
	return workspaceRealmForSession(context, rawId);
}
async function creativeTarget(realm, path, kind = "text") {
	assertCreativePath(path, kind);
	const target = await realm.fs.resolve(path, { cwd: realm.cwd });
	if (!realm.fs.contains(realm.root, target)) throw new WorkspaceHttpError(403, "文件路径离开了 DSH 工作目录。");
	return target;
}
function requireRegularFile(info) {
	if (info === void 0) throw new WorkspaceHttpError(404, "文件不存在。");
	if (info.type !== "file") throw new WorkspaceHttpError(415, "目标不是可编辑的普通文件。");
	return info;
}
/** Read bytes and a matching opaque version, retrying if a writer wins the read window. */
async function readVersionedFile(fs, target, maxBytes) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const before = requireRegularFile(await fs.stat(target));
		if (before.size !== void 0 && before.size > maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
		const bytes = await fs.readBytes(target, void 0, maxBytes);
		const after = requireRegularFile(await fs.stat(target));
		if (before.version !== after.version) continue;
		let content;
		try {
			content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			throw new WorkspaceHttpError(415, "文件不是有效的 UTF-8 文本。");
		}
		return {
			content,
			bytes: bytes.byteLength,
			version: after.version
		};
	}
	throw new WorkspaceHttpError(409, "文件正在被修改，请重试。");
}
async function listFiles(realm) {
	const files = [];
	const walk = async (path, directory) => {
		for (const entry of await realm.fs.listDir(directory)) {
			if (entry.name.startsWith(".") || !realm.fs.contains(realm.root, entry.target)) continue;
			const childPath = `${path}/${entry.name}`;
			if (entry.type === "directory") await walk(childPath, entry.target);
			else if (entry.type === "file" && (editablePath(childPath) || MEDIA_TYPES.has(extname(entry.name).toLocaleLowerCase()))) {
				const info = entry.version === void 0 || entry.size === void 0 ? await realm.fs.stat(entry.target) : void 0;
				const version = entry.version ?? info?.version;
				const mimeType = MEDIA_TYPES.get(extname(entry.name).toLocaleLowerCase());
				if (version !== void 0) files.push({
					path: childPath,
					bytes: entry.size ?? info?.size ?? 0,
					version,
					kind: mimeType === void 0 ? "text" : "media",
					mimeType
				});
			}
			if (files.length >= FILE_LIMIT) return;
		}
	};
	for (const directory of CREATIVE_DIRECTORIES) {
		const target = await realm.fs.resolve(directory, { cwd: realm.cwd });
		if (!realm.fs.contains(realm.root, target)) continue;
		if ((await realm.fs.stat(target))?.type === "directory") await walk(directory, target);
		if (files.length >= FILE_LIMIT) break;
	}
	for (const path of ROOT_FILES) {
		const target = await creativeTarget(realm, path);
		const info = await realm.fs.stat(target);
		if (info?.type === "file") files.push({
			path,
			bytes: info.size ?? 0,
			version: info.version,
			kind: "text"
		});
	}
	return files.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
}
async function metadata(realm, files, path, maxBytes) {
	if (!files.some((file) => file.path === path)) return { value: null };
	try {
		const target = await creativeTarget(realm, path);
		return { value: JSON.parse((await readVersionedFile(realm.fs, target, maxBytes)).content) };
	} catch (error) {
		return {
			value: null,
			error: error instanceof SyntaxError ? `${path} 不是有效的 JSON。` : `${path} 暂时无法读取。`
		};
	}
}
function mapFsError(error) {
	if (!(error instanceof FsError)) return void 0;
	switch (error.code) {
		case "FS_NOT_FOUND": return new WorkspaceHttpError(404, "文件不存在。");
		case "FS_TOO_LARGE": return new WorkspaceHttpError(413, "文件超过工作台大小限制。");
		case "FS_NOT_TEXT":
		case "FS_NOT_REGULAR_FILE": return new WorkspaceHttpError(415, "目标不是可编辑的文本文件。");
		case "FS_PERMISSION_DENIED":
		case "FS_SANDBOX_DENIED": return new WorkspaceHttpError(403, "当前 DSH 权限不允许修改该文件。");
		case "FS_STALE_VERSION":
		case "FS_NOT_OBSERVED": return new WorkspaceHttpError(412, "文件已在磁盘上更新。请处理冲突后再保存。");
		case "FS_ABORTED": return new WorkspaceHttpError(409, "文件操作已取消。");
		default: return new WorkspaceHttpError(500, "DSH 文件系统操作失败。");
	}
}
async function handle(context, request, response, options) {
	try {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (!isTrustedWorkspaceRequest(request, options.trustedHosts ?? [])) throw new WorkspaceHttpError(403, "请求来源不受信任。");
		if (url.pathname === "/oh-story/workspace" && request.method === "GET") {
			const realm = await workspaceRealm(context, url);
			const files = await listFiles(realm);
			const tracking = await metadata(realm, files, "追踪/_tracking-state.json", options.maxBytes);
			const shortDrama = await metadata(realm, files, "short-drama.json", options.maxBytes);
			const metadataErrors = [tracking.error, shortDrama.error].filter((value) => value !== void 0);
			send(response, 200, {
				cwd: realm.cwd,
				files,
				tracking: tracking.value,
				shortDrama: shortDrama.value,
				metadataErrors,
				mode: "dsh-session"
			});
			return;
		}
		if (url.pathname === "/oh-story/file" && request.method === "GET") {
			const realm = await workspaceRealm(context, url);
			const path = url.searchParams.get("path");
			if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
			send(response, 200, {
				path,
				...await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes)
			});
			return;
		}
		if (url.pathname === "/oh-story/media" && request.method === "GET") {
			const realm = await workspaceRealm(context, url);
			const path = url.searchParams.get("path");
			if (path === null) throw new WorkspaceHttpError(400, "缺少媒体文件路径。");
			const mimeType = mediaMimeTypeForPath(path);
			if (mimeType === void 0) throw new WorkspaceHttpError(415, "目标不是受支持的短剧媒体文件。");
			const target = await creativeTarget(realm, path, "media");
			const info = requireRegularFile(await realm.fs.stat(target));
			if (info.size !== void 0 && info.size > MEDIA_MAX_BYTES) throw new WorkspaceHttpError(413, "媒体文件超过工作台预览大小限制。");
			sendMedia(request, response, await realm.fs.readBytes(target, void 0, MEDIA_MAX_BYTES), mimeType);
			return;
		}
		if (url.pathname === "/oh-story/file" && request.method === "PUT") {
			const realm = await workspaceRealm(context, url);
			const path = url.searchParams.get("path");
			if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
			const input = await jsonBody(request, options.maxBytes * 6 + 1024);
			if (typeof input.content !== "string") throw new WorkspaceHttpError(400, "content 必须是字符串。");
			if (typeof input.baseVersion !== "string" || input.baseVersion === "") throw new WorkspaceHttpError(400, "baseVersion 必须是有效版本。");
			if (Buffer.byteLength(input.content) > options.maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
			const outcome = await realm.fs.writeText(await creativeTarget(realm, path), input.content, {
				kind: "replaceIfVersion",
				version: input.baseVersion
			}, void 0, realm.sandboxPolicy.resolve({ session: realm.agent.session }));
			send(response, 200, {
				path,
				content: outcome.after,
				bytes: Buffer.byteLength(outcome.after),
				version: outcome.version
			});
			return;
		}
		send(response, 404, { error: "Oh Story route not found." });
	} catch (error) {
		const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error);
		if (mapped === void 0) context.logger("oh-story").error("workspace route failed", error);
		send(response, mapped?.status ?? 500, { error: mapped?.message ?? "Oh Story workspace operation failed." });
	}
}
/** Mount the narrow editor API on DSH's official web-server extension seam. */
function registerWorkspaceRoute(context, options) {
	context.effect(() => context.webServer.register({
		kind: "prefix",
		path: "/oh-story",
		handler: (request, response) => handle(context, request, response, options)
	}), "oh-story: DSH-session workspace API");
}
//#endregion
//#region lib/types/native-hooks.js
const MUTATION_TOOLS = new Set([
	"write",
	"edit",
	"str_replace_editor"
]);
function mutationPath(name, args) {
	if (!MUTATION_TOOLS.has(name) || typeof args !== "object" || args === null || Array.isArray(args)) return void 0;
	const record = args;
	if (name === "str_replace_editor") {
		if (!new Set([
			"create",
			"str_replace",
			"insert"
		]).has(String(record.command))) return void 0;
		return typeof record.path === "string" && record.path.trim() !== "" ? record.path : void 0;
	}
	return typeof record.file_path === "string" && record.file_path.trim() !== "" ? record.file_path : void 0;
}
function normalizedRelativePath(path) {
	const segments = [];
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			if (segments.length === 0) return void 0;
			segments.pop();
		} else segments.push(part);
	}
	return segments.join("/");
}
function detectStoryMutation(name, args, cwd) {
	const rawPath = mutationPath(name, args);
	if (cwd === void 0 || rawPath === void 0) return void 0;
	const root = cwd.replaceAll("\\", "/").replace(/\/$/u, "");
	const candidate = rawPath.replaceAll("\\", "/");
	const absolute = candidate.startsWith("/") || /^[a-z]:\//iu.test(candidate) || /^[a-z][a-z\d+.-]*:\/\//iu.test(candidate);
	const insideRoot = /^[a-z]:\//iu.test(root) ? candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`) : candidate.startsWith(`${root}/`);
	if (absolute && !insideRoot) return void 0;
	const normalized = normalizedRelativePath(absolute ? candidate.slice(root.length + 1) : candidate);
	if (normalized === void 0) return void 0;
	if (!normalized.startsWith("正文/")) return void 0;
	const chapterText = /第0*(\d+)章/u.exec(normalized)?.[1];
	return {
		root,
		path: normalized,
		...chapterText === void 0 ? {} : { chapter: Number(chapterText) }
	};
}
async function storyMutation(exec, fs) {
	const cwd = exec.agent?.session.header.cwd;
	const path = mutationPath(exec.name, exec.arguments);
	if (cwd === void 0 || path === void 0) return void 0;
	try {
		const [rootTarget, mutationTarget] = await Promise.all([fs.resolve(cwd, { signal: exec.signal }), fs.resolve(path, {
			cwd,
			signal: exec.signal
		})]);
		if (!fs.contains(rootTarget, mutationTarget)) return void 0;
	} catch {
		return;
	}
	return detectStoryMutation(exec.name, exec.arguments, cwd);
}
async function target(fs, root, path, signal) {
	return fs.resolve(path, {
		cwd: root,
		...signal === void 0 ? {} : { signal }
	});
}
async function exists(fs, root, path, signal) {
	return target(fs, root, path, signal).then((value) => fs.stat(value, signal)).then((info) => info !== void 0, () => false);
}
async function hasChapterOutline(fs, root, chapter, signal) {
	return (await target(fs, root, "大纲", signal).then((directory) => fs.listDir(directory, signal)).catch(() => [])).some((entry) => entry.type === "file" && Number(/^细纲_第0*(\d+)章.*\.md$/u.exec(entry.name)?.[1]) === chapter);
}
async function validateStoryMutation(fs, mutation, signal) {
	if (!(await exists(fs, mutation.root, "大纲", signal) || await exists(fs, mutation.root, "追踪", signal))) return void 0;
	if (!await exists(fs, mutation.root, "追踪/_tracking-state.json", signal)) return;
	if (mutation.chapter !== void 0 && !await hasChapterOutline(fs, mutation.root, mutation.chapter, signal)) return `Oh Story 阻止写入第 ${String(mutation.chapter)} 章：未找到对应的 大纲/细纲_第XXX章*.md。请先完成细纲。`;
}
async function decideStoryMutation(exec, next) {
	const fs = exec.agent?.ctx.get("fs");
	if (fs === void 0) return next();
	const mutation = await storyMutation(exec, fs);
	if (mutation === void 0) return next();
	const reason = await validateStoryMutation(fs, mutation, exec.signal);
	if (reason !== void 0) return {
		kind: "deny",
		reason
	};
	return next();
}
/**
* Native DSH equivalents of the upstream prose guards. They join DSH's typed
* tool waterfall, so decisions remain visible in the official approval/tool UI.
*/
function registerOhStoryHooks(context) {
	context.on("tools/pre-execute", decideStoryMutation);
	context.on("tools/post-execute", async (exec, result, next) => {
		const downstream = await next();
		if (result.isError || downstream.kind !== "accept") return downstream;
		const fs = exec.agent?.ctx.get("fs");
		const mutation = fs === void 0 ? void 0 : await storyMutation(exec, fs);
		if (mutation === void 0) return downstream;
		const reminder = createUserMessage({
			source: {
				kind: "plugin",
				plugin: "oh-story"
			},
			content: [{
				type: "text",
				text: `<oh-story-post-write>正文 ${mutation.path} 已变更。继续当前步骤前核对并更新 _tracking-state.json 及对应派生 Tracking 视图；不要把这条提醒当作用户的新写作要求。</oh-story-post-write>`
			}]
		});
		return {
			...downstream,
			additionalContexts: [...downstream.additionalContexts ?? [], reminder]
		};
	});
}
//#endregion
//#region lib/types/index.js
/** Host registration: the /oh-story creative workspace editor API and its tools. */
const Config = z.object({
	editorMaxBytes: z.natural().min(65536).max(8388608).default(2097152),
	trustedHosts: z.array(String).default([])
});
const name = "oh-story-workspace";
const inject = [
	"tools",
	"typert",
	"webServer"
];
/** Mount only domain contributions into the current DSH process. */
async function apply(context, config = {}) {
	const trustedHosts = config.trustedHosts ?? [];
	for (const entry of trustedHosts) assertTrustedWorkspaceAuthority(entry);
	registerOhStoryProductionTool(context);
	registerWorkspaceRoute(context, {
		maxBytes: config.editorMaxBytes ?? 2097152,
		trustedHosts
	});
}
var types_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, OH_STORY_PRODUCTION_TOOL_NAME, apply, createOhStoryProductionTool, types_default as default, inject, name, registerOhStoryHooks, registerOhStoryProductionTool, registerWorkspaceRoute, validateProductionIntent };
