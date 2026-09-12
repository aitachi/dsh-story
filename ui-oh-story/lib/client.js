window.__ModuleLoader__.load({
	id: "@oh-story/ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperties(exports, {
			__esModule: { value: true },
			[Symbol.toStringTag]: { value: "Module" }
		});
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region lib/types/client/file-activity.js
		const STORY_DIRECTORIES = new Set([
			"正文",
			"大纲",
			"设定",
			"追踪",
			"对标",
			"参考资料"
		]);
		const DRAMA_DIRECTORIES = new Set([
			"输入",
			"项目开发",
			"设定集",
			"剧集",
			"交付",
			"创作者决策",
			"审查"
		]);
		const EDITABLE_EXTENSION = /\.(?:md|txt|json|jsonl|html|css|[cm]?js|tsx?|jsx)$/iu;
		const MUTATING_CALLS = new Set([
			"write",
			"edit",
			"str_replace_editor",
			"bash",
			"run_code",
			"oh_story_role"
		]);
		/** Read the latest running Assistant step, including tool-only steps hidden from the Chat list. */
		function streamingAssistant(timeline) {
			for (const turnNumber of timeline.turnOrder.toReversed()) {
				const turn = timeline.turns.get(turnNumber);
				if (turn === void 0) continue;
				for (const step of turn.steps.toReversed()) {
					const assistant = step.data.get("assistant-step");
					if (assistant?.status === "running") return assistant;
				}
			}
			return null;
		}
		function decodeEscape(character) {
			switch (character) {
				case "\"": return "\"";
				case "\\": return "\\";
				case "/": return "/";
				case "b": return "\b";
				case "f": return "\f";
				case "n": return "\n";
				case "r": return "\r";
				case "t": return "	";
				default: return;
			}
		}
		/** Read a JSON string even while the model is still streaming its closing quote. */
		function jsonStringPrefix(raw, key) {
			const match = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"\\s*:\\s*"`, "u").exec(raw);
			if (match === null) return void 0;
			let value = "";
			for (let index = match.index + match[0].length; index < raw.length; index += 1) {
				const character = raw[index] ?? "";
				if (character === "\"") return {
					value,
					complete: true
				};
				if (character !== "\\") {
					value += character;
					continue;
				}
				const escape = raw[index + 1];
				if (escape === void 0) return {
					value,
					complete: false
				};
				if (escape === "u") {
					const hex = raw.slice(index + 2, index + 6);
					if (!/^[\da-f]{4}$/iu.test(hex)) return {
						value,
						complete: false
					};
					value += String.fromCharCode(Number.parseInt(hex, 16));
					index += 5;
					continue;
				}
				const decoded = decodeEscape(escape);
				if (decoded === void 0) return {
					value,
					complete: false
				};
				value += decoded;
				index += 1;
			}
			return {
				value,
				complete: false
			};
		}
		function completedString(raw, key) {
			const value = jsonStringPrefix(raw, key);
			return value?.complete === true ? value.value : void 0;
		}
		function parsedArgs(raw) {
			try {
				const value = JSON.parse(raw);
				return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
			} catch {
				return;
			}
		}
		function mutationFromArgs(name, callId, argsRaw, stage) {
			const complete = parsedArgs(argsRaw);
			if (name === "write") return {
				callId,
				name,
				argsRaw,
				stage,
				path: jsonStringPrefix(argsRaw, "file_path")?.value,
				operation: "replace-file",
				oldText: void 0,
				newText: jsonStringPrefix(argsRaw, "content")?.value,
				replaceAll: false
			};
			if (name === "edit") return {
				callId,
				name,
				argsRaw,
				stage,
				path: jsonStringPrefix(argsRaw, "file_path")?.value,
				operation: "replace-text",
				oldText: completedString(argsRaw, "old_string"),
				newText: jsonStringPrefix(argsRaw, "new_string")?.value,
				replaceAll: complete?.replace_all === true
			};
			if (name !== "str_replace_editor") return void 0;
			const command = completedString(argsRaw, "command");
			if (command === "view") return void 0;
			const path = jsonStringPrefix(argsRaw, "path")?.value;
			if (command === "create") return {
				callId,
				name,
				argsRaw,
				stage,
				path,
				operation: "replace-file",
				oldText: void 0,
				newText: jsonStringPrefix(argsRaw, "file_text")?.value,
				replaceAll: false
			};
			if (command === "str_replace") return {
				callId,
				name,
				argsRaw,
				stage,
				path,
				operation: "replace-text",
				oldText: completedString(argsRaw, "old_str"),
				newText: jsonStringPrefix(argsRaw, "new_str")?.value ?? (complete !== void 0 ? "" : void 0),
				replaceAll: complete?.replace_all === true
			};
			if (command === "insert") return {
				callId,
				name,
				argsRaw,
				stage,
				path,
				operation: "insert-text",
				oldText: void 0,
				newText: jsonStringPrefix(argsRaw, "new_str")?.value,
				replaceAll: false
			};
			return {
				callId,
				name,
				argsRaw,
				stage,
				path,
				operation: void 0,
				oldText: void 0,
				newText: void 0,
				replaceAll: false
			};
		}
		function mutationsFromRunning(call) {
			const direct = mutationFromArgs(call.name, call.callId, call.argsRaw, "running");
			return direct === void 0 ? [] : [direct];
		}
		function visitRunning(blocks, visit) {
			for (const block of blocks) {
				if (!("kind" in block)) visit(block);
				visitRunning(block.subCalls, visit);
			}
		}
		/** Return every active file mutation in official DSH dispatch order, including nested Code Mode calls. */
		function fileMutations(runningCalls, partial = null) {
			const values = [];
			visitRunning(runningCalls, (call) => {
				values.push(...mutationsFromRunning(call));
			});
			for (const block of partial?.blocks ?? []) {
				if (block.kind !== "tool-call") continue;
				const value = mutationFromArgs(block.name, block.callId, block.argsRaw, "streaming");
				if (value !== void 0 && !values.some((candidate) => candidate.callId === value.callId)) values.push(value);
			}
			return values;
		}
		/** Running calls whose settlement may have changed creative files. */
		function mutatingCallIds(runningCalls) {
			const ids = /* @__PURE__ */ new Set();
			visitRunning(runningCalls, (call) => {
				if (MUTATING_CALLS.has(call.name)) ids.add(call.callId);
			});
			return ids;
		}
		function settledMutationSignals(block) {
			const nested = block.subCalls.flatMap(settledMutationSignals);
			if (!("kind" in block) || block.isError) return nested;
			const rawDiffs = typeof block.meta === "object" && block.meta !== null && !Array.isArray(block.meta) ? block.meta.diffs : void 0;
			const diffs = Array.isArray(rawDiffs) ? rawDiffs.filter((value) => typeof value === "object" && value !== null && typeof value.path === "string" && (typeof value.oldText === "string" || value.oldText === null) && typeof value.newText === "string") : void 0;
			if (diffs !== void 0) return [...diffs.map((diff, index) => `${block.callId}:${String(index)}\0${diff.path}`), ...nested];
			if (block.call === null) return nested;
			const mutation = mutationFromArgs(block.call.name, block.callId, block.call.argsRaw, "running");
			return mutation?.path === void 0 ? nested : [`${block.callId}\0${mutation.path}`, ...nested];
		}
		/** Latest durable successful mutation, used when a fast call skips the live render window. */
		function latestSettledMutation(chat) {
			for (const key of chat.order.toReversed()) {
				const node = chat.nodes.get(key);
				if (node?.kind !== "tool-call") continue;
				const root = node.data.root;
				const signal = root === void 0 ? void 0 : settledMutationSignals(root).at(-1);
				if (signal !== void 0) return signal;
			}
		}
		/** Convert a DSH tool path to the creative-relative path accepted by the narrow route. */
		function creativeRelativePath(path, cwd) {
			if (path === void 0 || path === "") return void 0;
			const normalized = path.replaceAll("\\", "/");
			const root = cwd?.replaceAll("\\", "/").replace(/\/$/u, "");
			const insideRoot = root !== void 0 && normalized.startsWith(`${root}/`);
			if ((normalized.startsWith("/") || /^[a-z]:\//iu.test(normalized) || normalized.startsWith("file:")) && !insideRoot) return void 0;
			const relative = insideRoot ? normalized.slice(root.length + 1) : normalized.replace(/^\.\//u, "");
			const [directory] = relative.split("/", 1);
			if (!(directory !== void 0 && (STORY_DIRECTORIES.has(directory) || DRAMA_DIRECTORIES.has(directory))) && relative !== "short-drama.json" || !EDITABLE_EXTENSION.test(relative)) return void 0;
			if (relative.split("/").some((part) => part === ".." || part === "." || part === "")) return void 0;
			return relative;
		}
		function workbenchModeForPath(path) {
			if (path === "short-drama.json") return "drama";
			const directory = path?.split("/", 1)[0];
			if (directory !== void 0 && STORY_DIRECTORIES.has(directory)) return "story";
			if (directory !== void 0 && DRAMA_DIRECTORIES.has(directory)) return "drama";
		}
		/** Choose the first useful document when a creative workbench opens. */
		function preferredWorkbenchFile(files, mode) {
			const matching = files.filter((file) => workbenchModeForPath(file.path) === mode);
			const preferences = mode === "story" ? [
				/^正文\/.*\.md$/u,
				/^大纲\/.*\.md$/u,
				/\.md$/u
			] : [
				/^剧集\/EP0*1\/剧本\.md$/u,
				/^剧集\/.*\/剧本\.md$/u,
				/^剧集\/EP0*1\/screenplay\.md$/iu,
				/^剧集\/.*\/screenplay\.md$/iu,
				/^项目开发\/creative-brief\.md$/u,
				/^输入\/.*\.md$/u,
				/\.md$/u,
				/^short-drama\.json$/u
			];
			for (const pattern of preferences) {
				const match = matching.find((file) => pattern.test(file.path));
				if (match !== void 0) return match.path;
			}
			return matching[0]?.path;
		}
		/** Project one streamed mutation over its immediate predecessor. */
		function previewMutation(activity, base) {
			if (activity.operation === "replace-file") return activity.newText;
			if (activity.operation === "replace-text") {
				if (activity.oldText === void 0 || activity.newText === void 0 || activity.oldText === "") return void 0;
				if (activity.replaceAll) return base.includes(activity.oldText) ? base.split(activity.oldText).join(activity.newText) : void 0;
				const at = base.indexOf(activity.oldText);
				return at < 0 ? void 0 : `${base.slice(0, at)}${activity.newText}${base.slice(at + activity.oldText.length)}`;
			}
			if (activity.operation === "insert-text") {
				if (activity.newText === void 0) return void 0;
				const rawLine = /"insert_line"\s*:\s*(\d+)/u.exec(activity.argsRaw)?.[1];
				if (rawLine === void 0) return void 0;
				const line = Number.parseInt(rawLine, 10);
				const parts = base.split("\n");
				const at = Math.max(0, Math.min(parts.length, line));
				parts.splice(at, 0, activity.newText);
				return parts.join("\n");
			}
		}
		//#endregion
		//#region lib/types/client/file-tree.js
		function directory(name, path) {
			return {
				name,
				path,
				directories: /* @__PURE__ */ new Map(),
				files: []
			};
		}
		function compareNames(left, right) {
			return left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true });
		}
		function freezeDirectory(value) {
			const directories = [...value.directories.values()].map(freezeDirectory).sort(compareNames);
			const files = [...value.files].sort(compareNames);
			return {
				kind: "directory",
				name: value.name,
				path: value.path,
				fileCount: files.length + directories.reduce((sum, child) => sum + child.fileCount, 0),
				children: [...directories, ...files]
			};
		}
		function buildFileTree(files, group) {
			const root = directory(group, group);
			for (const file of files) {
				const segments = (file.path.startsWith(`${group}/`) ? file.path.slice(group.length + 1) : file.path).split("/").filter((segment) => segment !== "");
				const name = segments.pop();
				if (name === void 0) continue;
				let parent = root;
				for (const segment of segments) {
					const path = `${parent.path}/${segment}`;
					const child = parent.directories.get(segment) ?? directory(segment, path);
					parent.directories.set(segment, child);
					parent = child;
				}
				parent.files.push({
					kind: "file",
					name,
					path: file.path,
					bytes: file.bytes
				});
			}
			return freezeDirectory(root).children;
		}
		//#endregion
		//#region lib/types/client/jsonl-preview.js
		const TITLE_KEYS = [
			"display_name",
			"title",
			"name",
			"shot_id",
			"scene_id",
			"episode_id",
			"character_id",
			"location_id",
			"view_id",
			"prop_id",
			"state_id",
			"decision_id",
			"occurrence_id",
			"record_id",
			"id"
		];
		function objectRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function stringField(record, keys) {
			for (const key of keys) {
				const value = record[key];
				if (typeof value === "string" && value.trim() !== "") return value;
			}
		}
		function metadata(value, line) {
			const record = objectRecord(value);
			if (record === void 0) return { title: typeof value === "string" ? value : JSON.stringify(value) ?? `第 ${String(line)} 行` };
			const type = stringField(record, [
				"record_type",
				"type",
				"kind"
			]);
			const acceptance = objectRecord(record.creator_acceptance);
			const status = stringField(record, ["status"]) ?? (acceptance === void 0 ? void 0 : stringField(acceptance, ["status"]));
			return {
				title: stringField(record, TITLE_KEYS) ?? `记录 ${String(line)}`,
				...type === void 0 ? {} : { type },
				...status === void 0 ? {} : { status }
			};
		}
		function parseJsonl(content) {
			const records = [];
			const lines = content.replaceAll("\r\n", "\n").split("\n");
			for (const [index, raw] of lines.entries()) {
				if (raw.trim() === "") continue;
				try {
					const value = JSON.parse(raw);
					records.push({
						line: index + 1,
						raw,
						value,
						...metadata(value, index + 1)
					});
				} catch (error) {
					records.push({
						line: index + 1,
						raw,
						title: `第 ${String(index + 1)} 行格式错误`,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
			return records;
		}
		const PREVIEW_LIMIT = 200;
		function JsonlPreview({ content, label }) {
			const records = parseJsonl(content);
			if (records.length === 0) return (0, react_jsx_runtime.jsx)("div", {
				className: "oh-story-markdown-empty",
				children: "这个 JSONL 文件还是空的。"
			});
			const valid = records.filter((record) => record.error === void 0).length;
			const errors = records.length - valid;
			const visible = records.slice(0, PREVIEW_LIMIT);
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-jsonl",
				"aria-label": `${label} 结构化预览`,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: "oh-story-jsonl-summary",
					children: [
						(0, react_jsx_runtime.jsx)("strong", { children: errors === 0 ? `${String(valid)} 条记录` : `${String(valid)} 条有效记录` }),
						errors > 0 && (0, react_jsx_runtime.jsxs)("span", { children: [String(errors), " 条格式错误"] }),
						records.length > PREVIEW_LIMIT && (0, react_jsx_runtime.jsxs)("span", { children: [
							"仅显示前 ",
							String(PREVIEW_LIMIT),
							" 条"
						] })
					]
				}), (0, react_jsx_runtime.jsx)("div", {
					className: "oh-story-jsonl-records",
					children: visible.map((record) => record.error === void 0 ? (0, react_jsx_runtime.jsxs)("details", {
						open: records.length <= 2,
						children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
							(0, react_jsx_runtime.jsxs)("span", { children: [
								"第 ",
								String(record.line),
								" 行"
							] }),
							(0, react_jsx_runtime.jsx)("strong", { children: record.title }),
							record.type !== void 0 && (0, react_jsx_runtime.jsx)("code", { children: record.type }),
							record.status !== void 0 && (0, react_jsx_runtime.jsx)("em", { children: record.status })
						] }), (0, react_jsx_runtime.jsx)("pre", { children: (0, react_jsx_runtime.jsx)("code", { children: JSON.stringify(record.value, null, 2) }) })]
					}, record.line) : (0, react_jsx_runtime.jsxs)("div", {
						className: "oh-story-jsonl-error",
						role: "alert",
						children: [
							(0, react_jsx_runtime.jsx)("strong", { children: record.title }),
							(0, react_jsx_runtime.jsx)("span", { children: record.error }),
							(0, react_jsx_runtime.jsx)("pre", { children: record.raw })
						]
					}, record.line))
				})]
			});
		}
		//#endregion
		//#region lib/types/client/markdown-preview.js
		const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/gu;
		function inline(source, key) {
			const nodes = [];
			let cursor = 0;
			for (const match of source.matchAll(INLINE)) {
				const token = match[0];
				const index = match.index;
				if (index > cursor) nodes.push(source.slice(cursor, index));
				if (token.startsWith("`")) nodes.push((0, react_jsx_runtime.jsx)("code", { children: token.slice(1, -1) }, `${key}-${String(index)}`));
				else if (token.startsWith("**")) nodes.push((0, react_jsx_runtime.jsx)("strong", { children: token.slice(2, -2) }, `${key}-${String(index)}`));
				else if (token.startsWith("~~")) nodes.push((0, react_jsx_runtime.jsx)("del", { children: token.slice(2, -2) }, `${key}-${String(index)}`));
				else if (token.startsWith("*")) nodes.push((0, react_jsx_runtime.jsx)("em", { children: token.slice(1, -1) }, `${key}-${String(index)}`));
				else {
					const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(token);
					nodes.push(link === null ? token : (0, react_jsx_runtime.jsx)("a", {
						href: link[2],
						target: "_blank",
						rel: "noreferrer",
						children: link[1]
					}, `${key}-${String(index)}`));
				}
				cursor = index + token.length;
			}
			if (cursor < source.length) nodes.push(source.slice(cursor));
			return nodes;
		}
		function splitTableRow(line) {
			let source = line.trim();
			if (source.startsWith("|")) source = source.slice(1);
			if (source.endsWith("|")) source = source.slice(0, -1);
			const cells = [];
			let cell = "";
			for (let index = 0; index < source.length; index += 1) {
				const character = source[index] ?? "";
				if (character === "\\" && source[index + 1] === "|") {
					cell += "|";
					index += 1;
				} else if (character === "|") {
					cells.push(cell.trim());
					cell = "";
				} else cell += character;
			}
			cells.push(cell.trim());
			return cells;
		}
		function tableAlignments(line) {
			const cells = splitTableRow(line);
			if (cells.length === 0 || !cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) return void 0;
			return cells.map((cell) => {
				if (cell.startsWith(":") && cell.endsWith(":")) return "center";
				if (cell.endsWith(":")) return "right";
				if (cell.startsWith(":")) return "left";
			});
		}
		function beginsBlock(lines, index) {
			const line = lines[index] ?? "";
			return /^(`{3,}|~{3,})\s*[\w-]*\s*$/u.test(line) || /^#{1,6}\s+/u.test(line) || /^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line) || /^>\s?/u.test(line) || /^[-*+]\s+/u.test(line) || /^\d+[.)]\s+/u.test(line) || line.includes("|") && tableAlignments(lines[index + 1] ?? "") !== void 0;
		}
		function parseMarkdownBlocks(markdown) {
			const lines = markdown.replaceAll("\r\n", "\n").split("\n");
			const result = [];
			for (let index = 0; index < lines.length;) {
				const line = lines[index] ?? "";
				if (line.trim() === "") {
					index += 1;
					continue;
				}
				const fence = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/u.exec(line);
				if (fence !== null) {
					const marker = fence[1] ?? "```";
					const markerCharacter = marker[0] ?? "`";
					const closing = new RegExp(`^${markerCharacter}{${String(marker.length)},}\\s*$`, "u");
					const code = [];
					index += 1;
					while (index < lines.length && !closing.test(lines[index] ?? "")) {
						code.push(lines[index] ?? "");
						index += 1;
					}
					if (index < lines.length) index += 1;
					result.push({
						kind: "code",
						lines: code,
						...fence[2] === void 0 || fence[2] === "" ? {} : { language: fence[2] }
					});
					continue;
				}
				const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
				if (heading !== null) {
					result.push({
						kind: "heading",
						text: heading[2] ?? "",
						level: heading[1]?.length ?? 1
					});
					index += 1;
					continue;
				}
				if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
					result.push({ kind: "rule" });
					index += 1;
					continue;
				}
				const alignments = line.includes("|") ? tableAlignments(lines[index + 1] ?? "") : void 0;
				if (alignments !== void 0) {
					const headers = splitTableRow(line);
					const rows = [];
					index += 2;
					while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
						rows.push(splitTableRow(lines[index] ?? ""));
						index += 1;
					}
					result.push({
						kind: "table",
						headers,
						rows,
						alignments
					});
					continue;
				}
				if (/^>\s?/u.test(line)) {
					const quote = [];
					while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
						quote.push((lines[index] ?? "").replace(/^>\s?/u, ""));
						index += 1;
					}
					result.push({
						kind: "quote",
						lines: quote
					});
					continue;
				}
				const unordered = /^[-*+]\s+(.+)$/u.exec(line);
				const ordered = /^(\d+)[.)]\s+(.+)$/u.exec(line);
				if (unordered !== null || ordered !== null) {
					const kind = unordered !== null ? "ul" : "ol";
					const items = [];
					const pattern = kind === "ul" ? /^[-*+]\s+(.+)$/u : /^\d+[.)]\s+(.+)$/u;
					const start = ordered === null ? void 0 : Number(ordered[1]);
					while (index < lines.length) {
						const item = pattern.exec(lines[index] ?? "");
						if (item === null) break;
						const source = item[1] ?? "";
						const task = /^\[([ xX])\]\s+(.+)$/u.exec(source);
						items.push(task === null ? { text: source } : {
							text: task[2] ?? "",
							checked: task[1]?.toLocaleLowerCase() === "x"
						});
						index += 1;
					}
					result.push({
						kind,
						items,
						...start === void 0 ? {} : { start }
					});
					continue;
				}
				const paragraph = [line];
				index += 1;
				while (index < lines.length) {
					const next = lines[index] ?? "";
					if (next.trim() === "" || beginsBlock(lines, index)) break;
					paragraph.push(next);
					index += 1;
				}
				result.push({
					kind: "paragraph",
					lines: paragraph
				});
			}
			return result;
		}
		function Heading({ block, blockKey }) {
			const children = inline(block.text, blockKey);
			switch (block.level) {
				case 1: return (0, react_jsx_runtime.jsx)("h1", { children });
				case 2: return (0, react_jsx_runtime.jsx)("h2", { children });
				case 3: return (0, react_jsx_runtime.jsx)("h3", { children });
				case 4: return (0, react_jsx_runtime.jsx)("h4", { children });
				case 5: return (0, react_jsx_runtime.jsx)("h5", { children });
				default: return (0, react_jsx_runtime.jsx)("h6", { children });
			}
		}
		function MarkdownPreview({ content, label }) {
			const parsed = parseMarkdownBlocks(content);
			if (parsed.length === 0) return (0, react_jsx_runtime.jsx)("div", {
				className: "oh-story-markdown-empty",
				children: "这个 Markdown 文件还是空的。"
			});
			return (0, react_jsx_runtime.jsx)("article", {
				className: "oh-story-markdown",
				"aria-label": `${label} 渲染预览`,
				children: parsed.map((block, index) => {
					const key = `block-${String(index)}`;
					if (block.kind === "code") return (0, react_jsx_runtime.jsx)("pre", { children: (0, react_jsx_runtime.jsx)("code", {
						"data-language": block.language,
						children: block.lines.join("\n")
					}) }, key);
					if (block.kind === "rule") return (0, react_jsx_runtime.jsx)("hr", {}, key);
					if (block.kind === "quote") return (0, react_jsx_runtime.jsx)("blockquote", { children: block.lines.map((line, lineIndex) => (0, react_jsx_runtime.jsx)("p", { children: inline(line, `${key}-${String(lineIndex)}`) }, `${key}-${String(lineIndex)}`)) }, key);
					if (block.kind === "ul" || block.kind === "ol") {
						const items = block.items.map((item, itemIndex) => (0, react_jsx_runtime.jsxs)("li", {
							className: item.checked === void 0 ? void 0 : "oh-story-task-item",
							children: [item.checked === void 0 ? null : (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: item.checked,
								readOnly: true,
								disabled: true,
								"aria-label": item.checked ? "已完成" : "未完成"
							}), inline(item.text, `${key}-${String(itemIndex)}`)]
						}, `${key}-${String(itemIndex)}`));
						return block.kind === "ul" ? (0, react_jsx_runtime.jsx)("ul", { children: items }, key) : (0, react_jsx_runtime.jsx)("ol", {
							start: block.start,
							children: items
						}, key);
					}
					if (block.kind === "table") return (0, react_jsx_runtime.jsx)("div", {
						className: "oh-story-markdown-table",
						children: (0, react_jsx_runtime.jsxs)("table", { children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsx)("tr", { children: block.headers.map((cell, cellIndex) => (0, react_jsx_runtime.jsx)("th", {
							style: { textAlign: block.alignments[cellIndex] },
							children: inline(cell, `${key}-h-${String(cellIndex)}`)
						}, `${key}-h-${String(cellIndex)}`)) }) }), (0, react_jsx_runtime.jsx)("tbody", { children: block.rows.map((row, rowIndex) => (0, react_jsx_runtime.jsx)("tr", { children: block.headers.map((_, cellIndex) => (0, react_jsx_runtime.jsx)("td", {
							style: { textAlign: block.alignments[cellIndex] },
							children: inline(row[cellIndex] ?? "", `${key}-r-${String(rowIndex)}-${String(cellIndex)}`)
						}, `${key}-r-${String(rowIndex)}-${String(cellIndex)}`)) }, `${key}-r-${String(rowIndex)}`)) })] })
					}, key);
					if (block.kind === "heading") return (0, react_jsx_runtime.jsx)(Heading, {
						block,
						blockKey: key
					}, key);
					if (block.kind === "paragraph") return (0, react_jsx_runtime.jsx)("p", { children: block.lines.map((line, lineIndex) => (0, react_jsx_runtime.jsxs)("span", { children: [lineIndex === 0 ? null : (0, react_jsx_runtime.jsx)("br", {}), inline(line, `${key}-${String(lineIndex)}`)] }, `${key}-${String(lineIndex)}`)) }, key);
					return null;
				})
			});
		}
		//#endregion
		//#region lib/types/client/drama-production.js
		const PRODUCTION_PROTOCOL_VERSION = "short-drama/v1";
		const CREATOR_DOCUMENT_NAMES = new Set([
			"剧本.md",
			"视觉设定.md",
			"分镜.md",
			"图片提示词.md",
			"视频提示词.md"
		]);
		function episodeDirectoryForPath(path) {
			if (path === void 0) return void 0;
			return /^(剧集\/[^/]+)\/[^/]+$/u.exec(path)?.[1];
		}
		function isCreatorDocumentPath(path) {
			const directory = episodeDirectoryForPath(path);
			const name = path.split("/").at(-1);
			return directory !== void 0 && name !== void 0 && CREATOR_DOCUMENT_NAMES.has(name);
		}
		function creatorDocumentPaths(files, episodeDirectory) {
			return files.map((file) => file.path).filter((path) => path.startsWith(`${episodeDirectory}/`) && CREATOR_DOCUMENT_NAMES.has(path.slice(episodeDirectory.length + 1))).sort((left, right) => creatorDocumentOrder(left) - creatorDocumentOrder(right) || left.localeCompare(right, "zh-Hans-CN"));
		}
		function parseEpisodeProduction(documents, episodeDirectory) {
			const storyboardPath = `${episodeDirectory}/分镜.md`;
			const imagePromptPath = `${episodeDirectory}/图片提示词.md`;
			const videoPromptPath = `${episodeDirectory}/视频提示词.md`;
			const visualPath = `${episodeDirectory}/视觉设定.md`;
			const shots = parseStoryboard(storyboardPath, documents[storyboardPath] ?? "");
			const assets = parseImagePrompts(imagePromptPath, documents[imagePromptPath] ?? "");
			const motions = parseVideoPrompts(videoPromptPath, documents[videoPromptPath] ?? "");
			const visualAssets = parseVisualAssets(visualPath, documents[visualPath] ?? "");
			const motionByShot = new Map(motions.flatMap((motion) => motion.shotId === void 0 ? [] : [[motion.shotId, motion]]));
			const linkedShots = shots.map((shot) => ({
				...shot,
				motion: motionByShot.get(shot.id)
			}));
			const targets = /* @__PURE__ */ new Map();
			for (const item of [
				...linkedShots,
				...assets,
				...motions,
				...visualAssets
			]) targets.set(item.id, {
				path: item.path,
				offset: item.offset,
				id: item.id
			});
			for (const shot of linkedShots) if (shot.source !== void 0) {
				const screenplayPath = `${episodeDirectory}/剧本.md`;
				const target = sectionTarget(screenplayPath, documents[screenplayPath] ?? "", shot.source);
				if (target !== void 0) targets.set(shot.source, target);
			}
			const diagnostics = validateProductionProtocol({
				documents,
				episodeDirectory,
				shots: linkedShots,
				assets,
				visualAssets,
				motions
			});
			return {
				protocolVersion: PRODUCTION_PROTOCOL_VERSION,
				episodeDirectory,
				shots: linkedShots,
				assets,
				visualAssets,
				motions,
				targets,
				documentPaths: Object.keys(documents).filter((path) => path.startsWith(`${episodeDirectory}/`)),
				diagnostics
			};
		}
		function parseStoryboard(path, content) {
			return levelTwoSections(content).flatMap((section) => {
				const match = /^(SHOT-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
				if (match === null || match[1] === void 0) return [];
				const fields = bulletFields(section.body);
				const id = match[1].toLocaleUpperCase();
				return [{
					id,
					title: match[2]?.trim() || id,
					path,
					offset: section.offset,
					source: firstField(fields, "来源", "场次"),
					durationSeconds: seconds(firstField(fields, "时长")),
					purpose: firstField(fields, "目的", "镜头目的"),
					shotSpec: firstField(fields, "景别/机位", "景别", "镜头规格"),
					start: firstField(fields, "起点", "起始"),
					end: firstField(fields, "终点", "结束"),
					references: splitReferences(firstField(fields, "图片提示词项", "视觉依据", "输入参考图", "参考", "关联资产")),
					keyframePrompt: quoteUnderHeading(section.body, "冻结关键帧提示词")
				}];
			});
		}
		function parseImagePrompts(path, content) {
			return levelTwoSections(content).flatMap((section) => {
				const match = /^(IMG-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
				if (match === null || match[1] === void 0) return [];
				const fields = bulletFields(section.body);
				const id = match[1].toLocaleUpperCase();
				const title = match[2]?.trim() || id;
				return [{
					id,
					title,
					kind: inferAssetKind(`${id} ${title} ${firstField(fields, "用途") ?? ""}`),
					path,
					offset: section.offset,
					purpose: firstField(fields, "用途"),
					reference: firstField(fields, "参考", "参考约束"),
					prompt: quoteUnderHeading(section.body, "可复制提示词")
				}];
			});
		}
		function parseVideoPrompts(path, content) {
			return levelTwoSections(content).flatMap((section) => {
				const match = /^(MOTION-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
				if (match === null || match[1] === void 0) return [];
				const fields = bulletFields(section.body);
				const id = match[1].toLocaleUpperCase();
				const shotId = firstField(fields, "分镜", "镜头", "关联镜头")?.match(/SHOT-[A-Z0-9-]+/iu)?.[0]?.toLocaleUpperCase();
				return [{
					id,
					title: match[2]?.trim() || id,
					path,
					offset: section.offset,
					shotId,
					durationSeconds: seconds(firstField(fields, "时长")),
					startFrame: firstField(fields, "起始帧", "起点"),
					end: firstField(fields, "终点", "结束"),
					prompt: quoteUnderHeading(section.body, "可复制提示词")
				}];
			});
		}
		function parseVisualAssets(path, content) {
			return levelTwoSections(content).flatMap((section) => {
				const match = /^(人物|角色|造型|地点|场景|道具|状态)\s*(?:[·｜|:]\s*)?(.*)$/u.exec(section.heading.trim());
				if (match === null || match[1] === void 0) return [];
				const fields = bulletFields(section.body);
				const title = match[2]?.trim() || section.heading.trim();
				const declaredId = firstField(fields, "ID", "资产 ID", "资产ID")?.trim().toLocaleUpperCase();
				const stableId = declaredId !== void 0 && /^VISUAL-[A-Z0-9-]+$/u.test(declaredId);
				return [{
					id: stableId ? declaredId : `VISUAL-${slug(`${match[1]}-${title}`)}`,
					title,
					kind: inferAssetKind(`${match[1]} ${title}`),
					path,
					offset: section.offset,
					description: section.body.trim(),
					stableId,
					declaredId
				}];
			});
		}
		function validateProductionProtocol(input) {
			const diagnostics = [];
			const add = (value) => {
				diagnostics.push({
					...value,
					line: lineAt(input.documents[value.path] ?? "", value.offset)
				});
			};
			const all = [
				...input.shots,
				...input.assets,
				...input.visualAssets,
				...input.motions
			];
			const byId = /* @__PURE__ */ new Map();
			for (const item of all) byId.set(item.id, [...byId.get(item.id) ?? [], item]);
			for (const [id, items] of byId) {
				if (items.length < 2) continue;
				for (const item of items) add({
					severity: "error",
					code: "duplicate_id",
					path: item.path,
					offset: item.offset,
					targetId: id,
					message: `${id} 在当前集内重复，后出现的条目会遮蔽前一条。`
				});
			}
			for (const visual of input.visualAssets) {
				if (visual.stableId) continue;
				add(visual.declaredId === void 0 ? {
					severity: "warning",
					code: "generated_visual_id",
					path: visual.path,
					offset: visual.offset,
					targetId: visual.id,
					message: `${visual.title} 缺少稳定的 “- ID：VISUAL-*”；修改标题会改变画布节点身份。`
				} : {
					severity: "warning",
					code: "invalid_visual_id",
					path: visual.path,
					offset: visual.offset,
					targetId: visual.id,
					message: `${visual.title} 的 “- ID：${visual.declaredId}” 不是可用形式，已回退到标题派生 ID；请写成 VISUAL- 加大写字母、数字或连字符。`
				});
			}
			const knownReferences = new Set([
				...input.assets,
				...input.visualAssets,
				...input.shots,
				...input.motions
			].map((item) => item.id));
			const screenplayPath = `${input.episodeDirectory}/剧本.md`;
			for (const shot of input.shots) {
				for (const reference of shot.references) if (!knownReferences.has(reference)) add({
					severity: "warning",
					code: "unknown_reference",
					path: shot.path,
					offset: shot.offset,
					targetId: shot.id,
					message: `${shot.id} 引用了未解析的 ${reference}。`
				});
				if (shot.source !== void 0 && sectionTarget(screenplayPath, input.documents[screenplayPath] ?? "", shot.source) === void 0) add({
					severity: "warning",
					code: "unknown_source",
					path: shot.path,
					offset: shot.offset,
					targetId: shot.id,
					message: `${shot.id} 的来源 ${shot.source} 在剧本中不存在。`
				});
			}
			const shots = new Set(input.shots.map((shot) => shot.id));
			const motionsByShot = /* @__PURE__ */ new Map();
			for (const motion of input.motions) {
				if (motion.shotId === void 0) {
					add({
						severity: "warning",
						code: "motion_without_shot",
						path: motion.path,
						offset: motion.offset,
						targetId: motion.id,
						message: `${motion.id} 没有可解析的 SHOT-* 分镜字段。`
					});
					continue;
				}
				if (!shots.has(motion.shotId)) add({
					severity: "error",
					code: "unknown_motion_shot",
					path: motion.path,
					offset: motion.offset,
					targetId: motion.id,
					message: `${motion.id} 指向不存在的 ${motion.shotId}。`
				});
				motionsByShot.set(motion.shotId, [...motionsByShot.get(motion.shotId) ?? [], motion]);
			}
			for (const [shotId, motions] of motionsByShot) {
				if (motions.length < 2) continue;
				for (const motion of motions) add({
					severity: "error",
					code: "multiple_motions",
					path: motion.path,
					offset: motion.offset,
					targetId: motion.id,
					message: `${shotId} 同时绑定了多个 MOTION，画布只能确定一个。`
				});
			}
			const parsedOffsets = new Set([
				...input.shots,
				...input.assets,
				...input.motions
			].map((item) => `${item.path}:${String(item.offset)}`));
			for (const [path, prefix] of [
				[`${input.episodeDirectory}/分镜.md`, "SHOT"],
				[`${input.episodeDirectory}/图片提示词.md`, "IMG"],
				[`${input.episodeDirectory}/视频提示词.md`, "MOTION"]
			]) for (const section of levelTwoSections(input.documents[path] ?? "")) if (section.heading.toLocaleUpperCase().startsWith(prefix) && !parsedOffsets.has(`${path}:${String(section.offset)}`)) add({
				severity: "error",
				code: "malformed_heading",
				path,
				offset: section.offset,
				message: `无法解析标题 “${section.heading.trim()}”，需要稳定的 ${prefix}-* ID。`
			});
			return diagnostics.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN") || left.offset - right.offset || left.code.localeCompare(right.code));
		}
		function productionCompleteness(shot) {
			const keyframe = Boolean(shot.keyframePrompt?.trim());
			const motion = Boolean(shot.motion?.prompt?.trim());
			return {
				keyframe,
				motion,
				references: shot.references.length > 0,
				complete: keyframe && motion
			};
		}
		function levelTwoSections(content) {
			const matches = [...content.matchAll(/^##\s+(.+)\s*$/gmu)];
			return matches.map((match, index) => {
				const start = (match.index ?? 0) + match[0].length;
				const end = matches[index + 1]?.index ?? content.length;
				return {
					heading: match[1] ?? "",
					body: content.slice(start, end),
					offset: match.index ?? 0
				};
			});
		}
		function bulletFields(body) {
			const fields = /* @__PURE__ */ new Map();
			for (const match of body.matchAll(/^\s*[-*]\s+([^：:\n]+)[：:]\s*(.+?)\s*$/gmu)) {
				const key = match[1]?.trim().replace(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/u, "$1").trim();
				const value = match[2]?.trim();
				if (key !== void 0 && value !== void 0) fields.set(key, value);
			}
			for (const match of body.matchAll(/^\s*\*\*([^：:\n]+?)\*\*\s*[：:]\s*(.+?)\s*$/gmu)) {
				const key = match[1]?.trim();
				const value = match[2]?.trim();
				if (key !== void 0 && value !== void 0 && !fields.has(key)) fields.set(key, value);
			}
			return fields;
		}
		function firstField(fields, ...names) {
			for (const name of names) {
				const value = fields.get(name);
				if (value !== void 0 && value !== "") return value;
			}
		}
		function quoteUnderHeading(body, heading) {
			const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
			const match = new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`, "imu").exec(body);
			if (match?.[1] === void 0) return void 0;
			const value = match[1].split(/\r?\n/u).filter((line) => /^\s*>/u.test(line)).map((line) => line.replace(/^\s*>\s?/u, "").trimEnd()).join("\n").trim();
			return value === "" ? void 0 : value;
		}
		function seconds(value) {
			if (value === void 0) return void 0;
			const match = /([0-9]+(?:\.[0-9]+)?)\s*(?:s|秒)/iu.exec(value);
			if (match?.[1] === void 0) return void 0;
			const parsed = Number(match[1]);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
		}
		function splitReferences(value) {
			if (value === void 0) return [];
			const ids = value.match(/(?:IMG|SHOT|MOTION)-[A-Z0-9-]+/giu) ?? [];
			return [...new Set(ids.map((id) => id.toLocaleUpperCase()))];
		}
		function inferAssetKind(value) {
			if (/(人物|角色|造型|character|portrait|sheet)/iu.test(value)) return "character";
			if (/(地点|场景|环境|scene|location|corridor|room)/iu.test(value)) return "scene";
			if (/(道具|物件|prop|object)/iu.test(value)) return "prop";
			if (/(状态|state|look)/iu.test(value)) return "state";
			return "unknown";
		}
		function slug(value) {
			return value.trim().toLocaleUpperCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/gu, "") || "ITEM";
		}
		function lineAt(content, offset) {
			return content.slice(0, Math.max(0, offset)).split(/\r?\n/u).length;
		}
		function sectionTarget(path, content, id) {
			const offset = content.search(new RegExp(`^##\\s+${id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:\\s|$)`, "imu"));
			return offset < 0 ? void 0 : {
				path,
				offset,
				id
			};
		}
		function creatorDocumentOrder(path) {
			const name = path.split("/").at(-1);
			return [
				"剧本.md",
				"视觉设定.md",
				"分镜.md",
				"图片提示词.md",
				"视频提示词.md"
			].indexOf(name ?? "");
		}
		//#endregion
		//#region lib/types/client/production-prompts.js
		const authorityBoundary = "只使用当前 DSH Preset 可见的工具；所有文件、网络、生成和命令操作继续遵守 DSH 权限与审批。";
		function nativeProductionPrompt(production, job, references) {
			const referenceText = references.length === 0 ? "无" : references.map((item) => `${item.targetId}: ${item.path ?? item.url}`).join("\n");
			return `/short-drama-produce

只准备当前单项生产任务，不运行 Provider。
- 任务 ID：${job.id}
- 任务类型：${job.kind === "image" ? "图片/关键帧" : "镜头视频"}
- 建议 adapter 契约：${job.kind === "image" ? "gpt-image-2" : "seedance"}（实际配置与模型以当前 DSH 运行环境为准）
- 投产对象：${job.targetId}
- 创作文档目录：${production.episodeDirectory}
- 参考素材：
${referenceText}
- 输出目录：${production.episodeDirectory}/制作成果/${job.targetId}
- 输出文件名必须同时包含投产对象 ID 与任务 ID ${job.id}，以便 DSH 工作台关联版本。

待预检提示词：
${job.prompt}

按 short-drama-produce 的硬闸门建立临时 job 并执行 prepare，在 Chat 中完整展示 adapter、模型/profile、数量、参数、references、outputs 与 overwrite。此按钮只表达“准备预览”，不构成看到预览后的生产确认；不得 confirm 或 run。用户在后续消息明确确认这份预览后，才可调用 oh_story_production track_job 登记同一个任务 ID，并运行 Provider。${authorityBoundary}`;
		}
		function nativeBatchPrompt(production, job, candidates) {
			return `/short-drama-produce

只准备当前批量生产任务，不运行 Provider。
- 批次任务 ID：${job.id}
- 任务类型：${job.kind === "image" ? "批量关键帧" : "批量镜头视频"}
- 建议 adapter 契约：${job.kind === "image" ? "gpt-image-2" : "seedance"}（实际配置与模型以当前 DSH 运行环境为准）
- 创作文档目录：${production.episodeDirectory}
- 输出根目录：${production.episodeDirectory}/制作成果
- 每个输出文件名必须包含对应镜头 ID 与批次任务 ID ${job.id}。

${candidates.map((item) => `## ${item.id}\n${item.prompt}`).join("\n\n")}

把数量、逐项输出和成本边界完整展示给创作者。此按钮只表达“准备预览”，不构成看到预览后的生产确认；不得 confirm 或 run。用户在后续消息明确确认这份预览后，才可调用 oh_story_production track_job 登记同一个批次任务 ID，并运行 Provider。${authorityBoundary}`;
		}
		function nativeCompositionPrompt(production, job, orderedPaths) {
			return `/short-drama-produce

执行创作者已明确确认的成片合成任务。
- 任务 ID：${job.id}
- 剧集：${production.episodeDirectory}
- 按以下顺序合成，不得自行换序：
${orderedPaths.map((path, index) => `${String(index + 1)}. ${path}`).join("\n")}
- 输出：${production.episodeDirectory}/制作成果/成片-${job.id}.mp4

先验证输入均存在且可读，再使用当前 DSH Preset 可见的媒体/命令工具执行；音视频参数不兼容时做明确、可审计的标准化。所有命令和写入继续遵守 DSH 权限与审批，不得伪造成功。`;
		}
		//#endregion
		//#region lib/types/client/production-runtime.js
		function createPendingJob(input) {
			return {
				id: input.id,
				targetId: input.targetId,
				kind: input.kind,
				status: "pending",
				progress: 0,
				prompt: input.prompt,
				expectedOutputs: Math.max(1, Math.floor(input.expectedOutputs ?? 1)),
				completedOutputs: 0
			};
		}
		function selectedVersionForTarget(targetId, versions, selections, kind) {
			const candidates = versions.filter((version) => version.targetId === targetId && (kind === void 0 || version.kind === kind));
			return candidates.find((version) => version.id === selections[targetId]) ?? candidates.at(-1);
		}
		function mediaTargetFromPath(path, knownTargets) {
			const segments = path.toLocaleUpperCase().split("/");
			const filename = segments.at(-1) ?? "";
			return [...knownTargets].sort((left, right) => right.length - left.length).find((target) => {
				const canonical = target.toLocaleUpperCase();
				return segments.includes(canonical) || filename === canonical || filename.startsWith(`${canonical}.`) || filename.startsWith(`${canonical}-`);
			});
		}
		function mediaVersionMatchesJob(version, jobId) {
			if (version.path === void 0 || jobId.trim() === "") return false;
			const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
			const basename = version.path.split("/").at(-1) ?? "";
			return new RegExp(`(?:^|[-_.])${escaped}(?:[-_.]|$)`, "u").test(basename);
		}
		function referencesForTarget(targetId, production, versions, selections, libraryVersions = versions, manualReferences = {}) {
			const shot = production.shots.find((item) => item.id === targetId);
			if (shot === void 0) return [];
			const declared = shot.references.flatMap((id) => {
				const version = selectedVersionForTarget(id, versions, selections, "image");
				return version === void 0 ? [] : [version];
			});
			const manual = (manualReferences[targetId] ?? []).flatMap((id) => {
				const version = libraryVersions.find((item) => item.id === id && item.kind === "image");
				return version === void 0 ? [] : [version];
			});
			return [...new Map([...declared, ...manual].map((version) => [version.id, version])).values()];
		}
		function queuedItemForJob(jobId, queue) {
			if (jobId.trim() === "") return void 0;
			const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
			const labelled = new RegExp(`任务\\s*ID\\s*[：:]\\s*${escaped}(?:[\\s.,;、。]|$)`, "u");
			return queue.find((item) => labelled.test(item.preview));
		}
		function activeProductionJobId(jobs, queue, sessionRunning) {
			if (!sessionRunning) return void 0;
			return [...jobs].reverse().find((job) => (job.status === "awaiting_confirmation" || job.status === "pending" || job.status === "running") && queuedItemForJob(job.id, queue) === void 0)?.id;
		}
		/** Reconcile the lightweight Session projection against DSH Queue/Turn state and real workspace outputs. */
		function reconcileProductionJobs(jobs, queue, sessionRunning, versions) {
			const latestPending = [...jobs].reverse().find((job) => job.status === "pending" && queuedItemForJob(job.id, queue) === void 0);
			return jobs.map((job) => {
				const queued = queuedItemForJob(job.id, queue) !== void 0;
				const outputs = versions.filter((version) => mediaVersionMatchesJob(version, job.id));
				if (outputs.length >= job.expectedOutputs) return {
					...job,
					status: "succeeded",
					progress: 100,
					completedOutputs: outputs.length,
					output: outputs[0],
					error: void 0
				};
				if (job.status === "canceled" || job.status === "succeeded" || job.status === "awaiting_confirmation" && outputs.length === 0) return job;
				if (job.status === "running" && queued) return {
					...job,
					status: "pending",
					progress: 0
				};
				if (job.status === "pending" && sessionRunning && !queued && job === latestPending) return {
					...job,
					status: "running",
					progress: Math.max(10, job.progress),
					error: void 0
				};
				if (!sessionRunning && !queued && (job.status === "running" || job.status === "dispatched_unknown")) return {
					...job,
					status: "dispatched_unknown",
					progress: Math.round(outputs.length / job.expectedOutputs * 100),
					completedOutputs: outputs.length,
					error: outputs.length === 0 ? "DSH Turn 已结束，尚未发现关联成果。任务可能已派发，请先刷新成果，避免重复计费。" : `DSH Turn 已结束，已发现 ${String(outputs.length)}/${String(job.expectedOutputs)} 项成果；请刷新核对剩余输出。`
				};
				if (outputs.length > 0) return {
					...job,
					status: job.status === "failed" ? "failed" : "running",
					progress: Math.max(10, Math.round(outputs.length / job.expectedOutputs * 100)),
					completedOutputs: outputs.length,
					error: job.status === "failed" ? job.error : void 0
				};
				return job;
			});
		}
		function reconcileSequence(shotIds, current, versions, selections) {
			const shotSet = new Set(shotIds);
			const preserved = current.filter((item) => shotSet.has(item.shotId));
			const present = new Set(preserved.map((item) => item.shotId));
			const appended = shotIds.filter((shotId) => !present.has(shotId)).map((shotId) => ({ shotId }));
			return [...preserved, ...appended].map((item) => ({
				shotId: item.shotId,
				versionId: selectedVersionForTarget(item.shotId, versions, selections, "video")?.id
			}));
		}
		function sequenceIssues(sequence, versions) {
			const versionById = new Map(versions.map((version) => [version.id, version]));
			const issues = [];
			for (const item of sequence) {
				const version = item.versionId === void 0 ? void 0 : versionById.get(item.versionId);
				if (version === void 0 || version.kind !== "video") issues.push(`${item.shotId} 缺少已选视频版本`);
				else if (version.path === void 0) issues.push(`${item.shotId} 的视频没有可供 DSH 读取的工作区路径`);
			}
			return issues;
		}
		function reorderSequence(sequence, source, target) {
			if (!Number.isInteger(source) || !Number.isInteger(target)) return [...sequence];
			if (source < 0 || target < 0 || source >= sequence.length || target >= sequence.length || source === target) return [...sequence];
			const next = [...sequence];
			const [item] = next.splice(source, 1);
			if (item !== void 0) next.splice(target, 0, item);
			return next;
		}
		//#endregion
		//#region lib/types/client/manual-canvas.js
		const copy = {
			title: "短剧素材与镜头关系画布",
			note: "从右侧连接点拖到另一模块；支持一连多、多连一。也可依次点击输出点和输入点。选中连线后按 Delete 删除。",
			input: "连接到",
			output: "从此模块连出",
			cancel: "取消连接",
			reset: "复位布局",
			empty: "请先生成素材或分镜文档。"
		};
		/** Directed manual graph. Document edges seed the graph until the first saved edit. */
		function ManualCanvas(props) {
			const [pending, setPending] = (0, react.useState)();
			const [selectedEdge, setSelectedEdge] = (0, react.useState)();
			const surface = (0, react.useRef)(null);
			const cleanup = (0, react.useRef)();
			(0, react.useEffect)(() => () => cleanup.current?.(), []);
			const nodes = [...[...props.production.assets, ...props.production.visualAssets].map((asset, index) => ({
				id: asset.id,
				label: asset.title,
				type: "asset",
				initial: {
					x: 80,
					y: 80 + index * 150
				}
			})), ...props.production.shots.map((shot, index) => ({
				id: shot.id,
				label: shot.title,
				type: "shot",
				initial: {
					x: 640,
					y: 80 + index * 180
				}
			}))].filter((node, index, all) => all.findIndex((item) => item.id === node.id) === index);
			const positions = Object.fromEntries(nodes.map((node) => [node.id, props.canvas[node.id] ?? node.initial]));
			const links = props.canvasLinks ?? props.production.shots.flatMap((shot) => shot.references.map((reference) => [reference, shot.id]));
			const connect = (from, to) => {
				if (from !== to && nodes.some((node) => node.id === to) && !links.some((link) => link[0] === from && link[1] === to)) props.onCanvasLinksChange?.([...links, [from, to]]);
				setPending(void 0);
			};
			const track = (move, end) => {
				cleanup.current?.();
				const stop = () => {
					globalThis.removeEventListener("pointermove", move);
					globalThis.removeEventListener("pointerup", up);
					globalThis.removeEventListener("pointercancel", cancel);
					cleanup.current = void 0;
				};
				const up = (event) => {
					stop();
					end(event);
				};
				const cancel = () => {
					stop();
					setPending(void 0);
				};
				cleanup.current = stop;
				globalThis.addEventListener("pointermove", move);
				globalThis.addEventListener("pointerup", up);
				globalThis.addEventListener("pointercancel", cancel);
			};
			const pointAt = (event) => {
				const bounds = surface.current.getBoundingClientRect();
				return {
					x: (event.clientX - bounds.left) / props.zoom,
					y: (event.clientY - bounds.top) / props.zoom
				};
			};
			const dragLink = (event, from) => {
				event.stopPropagation();
				event.preventDefault();
				if (event.button !== 0) return;
				setPending({
					from,
					point: pointAt(event)
				});
				track((move) => setPending({
					from,
					point: pointAt(move)
				}), (up) => {
					const target = document.elementFromPoint(up.clientX, up.clientY)?.closest("[data-node-id]");
					if (target?.dataset.nodeId !== void 0) connect(from, target.dataset.nodeId);
					else setPending(void 0);
				});
			};
			const drag = (event, id, origin) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				const start = {
					x: event.clientX,
					y: event.clientY
				};
				track((move) => props.onCanvasChange({
					...props.canvas,
					[id]: {
						x: origin.x + (move.clientX - start.x) / props.zoom,
						y: origin.y + (move.clientY - start.y) / props.zoom
					}
				}), () => {});
			};
			const remove = (from, to) => props.onCanvasLinksChange?.(links.filter((link) => link[0] !== from || link[1] !== to));
			const arrow = (from, to) => {
				const a = positions[from];
				const b = positions[to];
				if (!a || !b) return null;
				const id = `edge:${from}:${to}`;
				const start = {
					x: a.x + 180,
					y: a.y + 50
				};
				const end = {
					x: b.x,
					y: b.y + 50
				};
				const control = props.canvas[id] ?? {
					x: (start.x + end.x) / 2,
					y: (start.y + end.y) / 2
				};
				const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
				const reset = () => {
					const next = { ...props.canvas };
					delete next[id];
					props.onCanvasChange(next);
				};
				return (0, react_jsx_runtime.jsxs)("g", {
					"data-active": selectedEdge === id || void 0,
					children: [
						(0, react_jsx_runtime.jsx)("path", {
							className: "oh-story-canvas-edge",
							markerEnd: "url(#oh-story-canvas-arrowhead)",
							d: path
						}),
						(0, react_jsx_runtime.jsx)("path", {
							className: "oh-story-canvas-edge-hit",
							"data-edge-id": id,
							role: "button",
							tabIndex: 0,
							"aria-label": `拖动箭头 ${from} 到 ${to}；Delete 删除，方向键微调，Esc 复位`,
							d: path,
							onPointerDown: (event) => {
								setSelectedEdge(id);
								props.onSelect(to);
								drag(event, id, control);
							},
							onKeyDown: (event) => {
								const step = event.shiftKey ? 40 : 10;
								const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : void 0;
								if (delta) {
									event.preventDefault();
									props.onCanvasChange({
										...props.canvas,
										[id]: {
											x: control.x + delta[0],
											y: control.y + delta[1]
										}
									});
								} else if (event.key === "Delete" || event.key === "Backspace") {
									event.preventDefault();
									remove(from, to);
								} else if (event.key === "Escape") reset();
							},
							onDoubleClick: reset
						}),
						(0, react_jsx_runtime.jsx)("circle", {
							className: "oh-story-canvas-edge-handle",
							cx: control.x,
							cy: control.y,
							r: "5"
						})
					]
				}, id);
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-canvas-shell",
				"aria-label": copy.title,
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						cleanup.current?.();
						setPending(void 0);
					}
				},
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: "oh-story-projection-note",
						children: copy.note
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "oh-story-canvas-controls",
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "缩小画布",
								onClick: () => props.onZoomChange(Math.max(.5, props.zoom - .1)),
								children: "−"
							}),
							(0, react_jsx_runtime.jsxs)("span", { children: [Math.round(props.zoom * 100), "%"] }),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "放大画布",
								onClick: () => props.onZoomChange(Math.min(1.8, props.zoom + .1)),
								children: "＋"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									props.onCanvasChange({});
									props.onZoomChange(.65);
								},
								children: copy.reset
							}),
							pending && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setPending(void 0),
								children: copy.cancel
							}),
							selectedEdge && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									const link = links.find(([a, b]) => `edge:${a}:${b}` === selectedEdge);
									if (link) remove(...link);
									setSelectedEdge(void 0);
								},
								children: "删除所选连线"
							})
						]
					}),
					nodes.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: copy.empty }) : (0, react_jsx_runtime.jsx)("div", {
						className: "oh-story-canvas-viewport",
						children: (0, react_jsx_runtime.jsxs)("div", {
							ref: surface,
							className: "oh-story-canvas",
							style: {
								transform: `scale(${props.zoom})`,
								minHeight: Math.max(1e3, ...Object.values(positions).map((point) => point.y + 200)),
								minWidth: Math.max(1200, ...Object.values(positions).map((point) => point.x + 300))
							},
							children: [(0, react_jsx_runtime.jsxs)("svg", { children: [
								(0, react_jsx_runtime.jsx)("defs", { children: (0, react_jsx_runtime.jsx)("marker", {
									id: "oh-story-canvas-arrowhead",
									viewBox: "0 0 10 10",
									refX: "9",
									refY: "5",
									markerWidth: "8",
									markerHeight: "8",
									orient: "auto-start-reverse",
									children: (0, react_jsx_runtime.jsx)("polygon", { points: "0,0 10,5 0,10" })
								}) }),
								links.map(([from, to]) => arrow(from, to)),
								pending?.point && positions[pending.from] && (0, react_jsx_runtime.jsx)("path", {
									className: "oh-story-canvas-edge",
									style: {
										pointerEvents: "none",
										strokeDasharray: "8 5"
									},
									markerEnd: "url(#oh-story-canvas-arrowhead)",
									d: `M ${positions[pending.from].x + 180} ${positions[pending.from].y + 50} L ${pending.point.x} ${pending.point.y}`
								})
							] }), nodes.map((node) => (0, react_jsx_runtime.jsxs)("article", {
								tabIndex: 0,
								"data-node-id": node.id,
								"data-node-type": node.type,
								"aria-label": `${node.type === "asset" ? "素材" : "镜头"} ${node.label}`,
								"data-selected": node.id === props.selectedId || void 0,
								style: {
									left: positions[node.id].x,
									top: positions[node.id].y,
									touchAction: "none"
								},
								onPointerDown: (event) => drag(event, node.id, positions[node.id]),
								onDoubleClick: () => {
									const target = props.production.targets.get(node.id);
									if (target) props.onNavigate(target);
								},
								onKeyDown: (event) => {
									if (event.target !== event.currentTarget) return;
									const step = event.shiftKey ? 40 : 10;
									const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : void 0;
									if (delta) {
										event.preventDefault();
										props.onCanvasChange({
											...props.canvas,
											[node.id]: {
												x: positions[node.id].x + delta[0],
												y: positions[node.id].y + delta[1]
											}
										});
									}
								},
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "oh-story-canvas-port",
										"data-port": "in",
										style: { left: -12 },
										"aria-label": `${copy.input} ${node.id}`,
										title: copy.input,
										onPointerDown: (event) => event.stopPropagation(),
										onClick: () => {
											if (pending) connect(pending.from, node.id);
										},
										children: "●"
									}),
									(0, react_jsx_runtime.jsx)("small", { children: node.type === "asset" ? "素材" : "镜头" }),
									(0, react_jsx_runtime.jsx)("strong", { children: node.label }),
									(0, react_jsx_runtime.jsx)("span", { children: node.id }),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "oh-story-canvas-port",
										"data-port": "out",
										style: { right: -12 },
										"aria-label": `${copy.output} ${node.id}`,
										title: copy.output,
										onPointerDown: (event) => dragLink(event, node.id),
										onClick: (event) => {
											event.stopPropagation();
											setPending({ from: node.id });
										},
										children: "➜"
									})
								]
							}, node.id))]
						})
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/drama-production-view.js
		const SECTION_LABELS = {
			shots: "镜头",
			assets: "素材",
			tasks: "任务",
			sequence: "成片",
			canvas: "画布"
		};
		const SECTION_ORDER = Object.keys(SECTION_LABELS);
		const STATUS_LABELS = {
			awaiting_confirmation: "等待确认",
			pending: "已提交",
			running: "DSH 执行中",
			dispatched_unknown: "待核对",
			succeeded: "已完成",
			failed: "失败",
			canceled: "已取消"
		};
		const ASSET_KIND_LABEL = {
			character: "人物",
			scene: "场景",
			prop: "道具",
			state: "状态",
			unknown: "设定"
		};
		const JOB_KIND_LABEL = {
			image: "图片",
			video: "视频",
			composition: "成片"
		};
		function handleSectionKey(event, current, onChange) {
			const index = SECTION_ORDER.indexOf(current);
			const next = event.key === "Home" ? 0 : event.key === "End" ? SECTION_ORDER.length - 1 : event.key === "ArrowRight" ? (index + 1) % SECTION_ORDER.length : event.key === "ArrowLeft" ? (index - 1 + SECTION_ORDER.length) % SECTION_ORDER.length : void 0;
			if (next === void 0) return;
			event.preventDefault();
			onChange(SECTION_ORDER[next]);
			event.currentTarget.parentElement?.querySelectorAll("[role='tab']")[next]?.focus();
		}
		function DramaProductionView(props) {
			const [notice, setNotice] = (0, react.useState)();
			const protocolErrors = props.production.diagnostics.filter((item) => item.severity === "error").length;
			const jobsRef = (0, react.useRef)(props.jobs);
			const commitJobs = (0, react.useCallback)((next) => {
				jobsRef.current = next;
				props.onJobsChange(next);
			}, [props.onJobsChange]);
			(0, react.useEffect)(() => {
				jobsRef.current = props.jobs;
			}, [props.jobs]);
			(0, react.useEffect)(() => {
				const next = reconcileSequence(props.production.shots.map((shot) => shot.id), props.sequence, props.versions, props.selections);
				if (JSON.stringify(next) !== JSON.stringify(props.sequence)) props.onSequenceChange(next);
			}, [
				props.production.shots,
				props.selections,
				props.sequence,
				props.versions
			]);
			(0, react.useEffect)(() => {
				const next = reconcileProductionJobs(props.jobs, props.queue, props.sessionRunning, props.versions);
				if (JSON.stringify(next) !== JSON.stringify(props.jobs)) commitJobs(next);
			}, [
				commitJobs,
				props.jobs,
				props.queue,
				props.sessionRunning,
				props.versions
			]);
			const dispatchJob = async (job, references = []) => {
				commitJobs([...jobsRef.current, {
					...job,
					status: "awaiting_confirmation"
				}]);
				props.onSectionChange("tasks");
				try {
					await props.onDispatchPrompt(nativeProductionPrompt(props.production, job, references));
					setNotice(`${job.targetId} 正在准备完整预检；请在 Chat 查看并明确确认后再生产。`);
				} catch (error) {
					commitJobs(jobsRef.current.map((item) => item.id === job.id ? {
						...item,
						status: "failed",
						error: error instanceof Error ? error.message : String(error)
					} : item));
				}
			};
			const createJob = async (targetId, kind, prompt) => {
				if (prompt.trim() === "") {
					setNotice(`${targetId} 没有可投产提示词。`);
					return;
				}
				await dispatchJob(createPendingJob({
					id: crypto.randomUUID(),
					targetId,
					kind,
					prompt
				}), kind === "video" ? referencesForTarget(targetId, props.production, props.versions, props.selections, props.libraryVersions, props.manualReferences) : []);
			};
			const createBatch = async (kind) => {
				const candidates = props.production.shots.flatMap((shot) => {
					const prompt = kind === "image" ? shot.keyframePrompt : shot.motion?.prompt;
					return prompt === void 0 ? [] : [{
						id: shot.id,
						prompt
					}];
				});
				if (candidates.length === 0) {
					setNotice(kind === "image" ? "没有可投产的关键帧提示词。" : "没有可投产的视频提示词。");
					return;
				}
				const job = createPendingJob({
					id: crypto.randomUUID(),
					targetId: kind === "image" ? "BATCH-KEYFRAMES" : "BATCH-VIDEOS",
					kind,
					prompt: candidates.map((item) => `${item.id}\n${item.prompt}`).join("\n\n"),
					expectedOutputs: candidates.length
				});
				commitJobs([...jobsRef.current, {
					...job,
					status: "awaiting_confirmation"
				}]);
				props.onSectionChange("tasks");
				try {
					await props.onDispatchPrompt(nativeBatchPrompt(props.production, job, candidates));
					setNotice(`${String(candidates.length)} 个镜头正在准备同一批次预检；请在 Chat 核对后明确确认。`);
				} catch (error) {
					commitJobs(jobsRef.current.map((item) => item.id === job.id ? {
						...item,
						status: "failed",
						error: error instanceof Error ? error.message : String(error)
					} : item));
				}
			};
			const dispatchComposition = async (job) => {
				const versionById = new Map(props.versions.map((version) => [version.id, version]));
				const ordered = props.sequence.flatMap((item) => {
					const version = item.versionId === void 0 ? void 0 : versionById.get(item.versionId);
					return version === void 0 ? [] : [version.path ?? version.url];
				});
				commitJobs([...jobsRef.current, job]);
				props.onSectionChange("tasks");
				try {
					await props.onDispatchPrompt(nativeCompositionPrompt(props.production, job, ordered));
					setNotice("成片任务已进入 DSH 原生队列；文件、FFmpeg 和写入继续受 DSH 权限与审批控制。");
				} catch (error) {
					commitJobs(jobsRef.current.map((item) => item.id === job.id ? {
						...item,
						status: "failed",
						error: error instanceof Error ? error.message : String(error)
					} : item));
				}
			};
			const cancelJob = async (job) => {
				try {
					await props.onCancelTurn();
					commitJobs(jobsRef.current.map((item) => item.id === job.id ? {
						...item,
						status: "canceled",
						progress: 0
					} : item));
					setNotice("已请求停止当前 DSH Turn；DSH Queue 中的其他任务会保留。");
				} catch (error) {
					setNotice(error instanceof Error ? error.message : String(error));
				}
			};
			const removeQueuedJob = async (job, itemId) => {
				try {
					await props.onRemoveQueued(itemId);
					commitJobs(jobsRef.current.map((item) => item.id === job.id ? {
						...item,
						status: "canceled",
						progress: 0
					} : item));
					setNotice(`${job.targetId} 已从 DSH Queue 移除。`);
				} catch (error) {
					setNotice(error instanceof Error ? error.message : String(error));
				}
			};
			const composeSequence = () => {
				const issues = sequenceIssues(props.sequence, props.versions);
				if (issues.length > 0) {
					setNotice(issues[0]);
					return;
				}
				dispatchComposition(createPendingJob({
					id: crypto.randomUUID(),
					targetId: props.production.episodeDirectory,
					kind: "composition",
					prompt: "按成片顺序合成"
				}));
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "oh-story-production",
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "oh-story-production-bar",
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-production-tabs",
							role: "tablist",
							"aria-label": "短剧生产视图",
							children: SECTION_ORDER.map((item) => (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								tabIndex: props.section === item ? 0 : -1,
								"aria-selected": props.section === item,
								onKeyDown: (event) => {
									handleSectionKey(event, item, props.onSectionChange);
								},
								onClick: () => {
									props.onSectionChange(item);
								},
								children: SECTION_LABELS[item]
							}, item))
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-production-meta",
							children: [(0, react_jsx_runtime.jsxs)("span", {
								className: "oh-story-production-summary",
								children: [
									props.production.shots.length,
									" 镜 · ",
									props.production.assets.length + props.production.visualAssets.length,
									" 素材 · ",
									props.jobs.filter((job) => job.status === "awaiting_confirmation" || job.status === "running" || job.status === "pending").length,
									" 任务"
								]
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: props.onRefresh,
								children: "刷新"
							})]
						})]
					}),
					notice !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
						className: "oh-story-production-notice",
						role: "status",
						children: [(0, react_jsx_runtime.jsx)("span", { children: notice }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": "关闭提示",
							onClick: () => {
								setNotice(void 0);
							},
							children: "×"
						})]
					}),
					props.production.diagnostics.length > 0 && (0, react_jsx_runtime.jsxs)("details", {
						className: "oh-story-production-diagnostics",
						children: [
							(0, react_jsx_runtime.jsx)("summary", { children: protocolErrors > 0 ? `${String(protocolErrors)} 个协议错误` : `${String(props.production.diagnostics.length)} 个格式提醒` }),
							(0, react_jsx_runtime.jsx)("ul", { children: props.production.diagnostics.slice(0, 8).map((item) => (0, react_jsx_runtime.jsxs)("li", {
								"data-severity": item.severity,
								children: [(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => {
										props.onNavigate({
											path: item.path,
											offset: item.offset,
											id: item.targetId ?? item.code
										});
									},
									children: [
										item.path.split("/").at(-1),
										":",
										item.line
									]
								}), (0, react_jsx_runtime.jsx)("span", { children: item.message })]
							}, `${item.path}:${String(item.offset)}:${item.code}`)) }),
							props.production.diagnostics.length > 8 && (0, react_jsx_runtime.jsxs)("p", { children: [
								"另有 ",
								props.production.diagnostics.length - 8,
								" 项，请按文档位置修复。"
							] })
						]
					}),
					props.section === "shots" && (0, react_jsx_runtime.jsx)(ShotBoard, {
						...props,
						onCreateJob: createJob,
						onBatch: createBatch
					}),
					props.section === "assets" && (0, react_jsx_runtime.jsx)(AssetBoard, {
						...props,
						onCreateJob: createJob
					}),
					props.section === "tasks" && (0, react_jsx_runtime.jsx)(TaskBoard, {
						jobs: props.jobs,
						queue: props.queue,
						sessionRunning: props.sessionRunning,
						onCancel: cancelJob,
						onRemoveQueued: removeQueuedJob
					}),
					props.section === "sequence" && (0, react_jsx_runtime.jsx)(SequenceBoard, {
						...props,
						onCompose: composeSequence
					}),
					props.section === "canvas" && (0, react_jsx_runtime.jsx)(ProductionCanvas, { ...props })
				]
			});
		}
		function ShotBoard(props) {
			const selectedRef = useScrollIntoView(props.selectedId);
			if (props.production.shots.length === 0) return (0, react_jsx_runtime.jsx)("section", {
				className: "oh-story-shot-board",
				children: (0, react_jsx_runtime.jsx)(MissingDocument, {
					document: `${props.production.episodeDirectory}/分镜.md`,
					documentPaths: props.production.documentPaths,
					what: "镜头",
					skill: "/short-drama-storyboard",
					onNavigate: props.onNavigate
				})
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-shot-board",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "oh-story-production-actions",
					children: [(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							props.onBatch("image");
						},
						children: "准备批量关键帧"
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							props.onBatch("video");
						},
						children: "准备批量视频"
					})]
				}), (0, react_jsx_runtime.jsx)("div", {
					className: "oh-story-shot-grid",
					children: props.production.shots.map((shot) => {
						const completeness = productionCompleteness(shot);
						const versions = props.versions.filter((version) => version.targetId === shot.id);
						const selected = selectedVersionForTarget(shot.id, props.versions, props.selections, "image") ?? selectedVersionForTarget(shot.id, props.versions, props.selections, "video");
						return (0, react_jsx_runtime.jsxs)("article", {
							className: "oh-story-shot-card",
							role: "button",
							tabIndex: 0,
							"aria-pressed": props.selectedId === shot.id,
							"aria-label": `选中镜头 ${shot.id} ${shot.title}`,
							ref: props.selectedId === shot.id ? selectedRef : void 0,
							"data-selected": props.selectedId === shot.id || void 0,
							onKeyDown: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									props.onSelect(shot.id);
								}
							},
							onClick: () => {
								props.onSelect(shot.id);
							},
							children: [
								selected === void 0 ? (0, react_jsx_runtime.jsxs)("div", {
									className: "oh-story-shot-placeholder",
									children: [(0, react_jsx_runtime.jsx)("strong", { children: shot.id.split("-").at(-1) }), (0, react_jsx_runtime.jsx)("span", { children: "等待关键帧成果" })]
								}) : (0, react_jsx_runtime.jsx)(MediaPreview, { version: selected }),
								(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: (event) => {
										event.stopPropagation();
										props.onNavigate({
											path: shot.path,
											offset: shot.offset,
											id: shot.id
										});
									},
									children: shot.id
								}), (0, react_jsx_runtime.jsx)("span", { children: shot.durationSeconds === void 0 ? "—" : `${String(shot.durationSeconds)}s` })] }),
								(0, react_jsx_runtime.jsx)("h3", { children: shot.title }),
								shot.shotSpec !== void 0 && (0, react_jsx_runtime.jsx)("p", { children: shot.shotSpec }),
								(0, react_jsx_runtime.jsxs)("dl", { children: [
									(0, react_jsx_runtime.jsx)("dt", { children: "起" }),
									(0, react_jsx_runtime.jsx)("dd", { children: shot.start ?? "未填写" }),
									(0, react_jsx_runtime.jsx)("dt", { children: "终" }),
									(0, react_jsx_runtime.jsx)("dd", { children: shot.end ?? "未填写" })
								] }),
								(0, react_jsx_runtime.jsxs)("div", {
									className: "oh-story-shot-status",
									children: [
										(0, react_jsx_runtime.jsx)(ReadinessBadge, {
											label: "关键帧",
											ready: completeness.keyframe
										}),
										(0, react_jsx_runtime.jsx)(ReadinessBadge, {
											label: "运动",
											ready: completeness.motion
										}),
										(0, react_jsx_runtime.jsx)(ReadinessBadge, {
											label: "参考",
											ready: completeness.references
										}),
										(0, react_jsx_runtime.jsxs)("span", { children: [versions.length, " 版本"] })
									]
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: "oh-story-reference-links",
									children: [shot.source !== void 0 && (0, react_jsx_runtime.jsx)(ReferenceButton, {
										id: shot.source,
										production: props.production,
										onNavigate: props.onNavigate
									}), shot.references.map((id) => (0, react_jsx_runtime.jsx)(ReferenceButton, {
										id,
										production: props.production,
										onNavigate: props.onNavigate
									}, id))]
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: "oh-story-card-actions",
									children: [shot.keyframePrompt !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: (event) => {
											event.stopPropagation();
											props.onCreateJob(shot.id, "image", shot.keyframePrompt ?? "");
										},
										children: "准备关键帧"
									}), shot.motion?.prompt !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: (event) => {
											event.stopPropagation();
											props.onCreateJob(shot.id, "video", shot.motion?.prompt ?? "");
										},
										children: "准备视频"
									})]
								}),
								versions.length > 1 && (0, react_jsx_runtime.jsx)(VersionStrip, {
									targetId: shot.id,
									versions,
									selections: props.selections,
									onSelectionsChange: props.onSelectionsChange
								})
							]
						}, shot.id);
					})
				})]
			});
		}
		function AssetBoard(props) {
			const [query, setQuery] = (0, react.useState)("");
			const [kind, setKind] = (0, react.useState)("all");
			const assets = [...props.production.assets, ...props.production.visualAssets.filter((visual) => !props.production.assets.some((asset) => asset.title === visual.title))];
			const needle = query.trim().toLocaleLowerCase();
			const library = props.libraryVersions.filter((version) => (kind === "all" || version.kind === kind) && (needle === "" || `${version.targetId} ${version.path ?? ""}`.toLocaleLowerCase().includes(needle)));
			const selectedRef = useScrollIntoView(props.selectedId);
			const referenceTarget = props.selectedId?.startsWith("SHOT-") === true ? props.selectedId : void 0;
			const toggleReference = (versionId) => {
				if (referenceTarget === void 0) return;
				const current = props.manualReferences[referenceTarget] ?? [];
				const next = current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current, versionId];
				const mutable = Object.fromEntries(Object.entries(props.manualReferences).map(([target, ids]) => [target, [...ids]]));
				props.onManualReferencesChange({
					...mutable,
					[referenceTarget]: next
				});
			};
			if (assets.length === 0 && props.libraryVersions.length === 0) return (0, react_jsx_runtime.jsx)("section", {
				className: "oh-story-assets",
				children: (0, react_jsx_runtime.jsx)(MissingDocument, {
					document: `${props.production.episodeDirectory}/图片提示词.md`,
					documentPaths: props.production.documentPaths,
					what: "素材",
					skill: "/short-drama-image-prompts",
					onNavigate: props.onNavigate
				})
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-assets",
				children: [(0, react_jsx_runtime.jsx)("div", {
					className: "oh-story-asset-grid",
					children: assets.map((asset) => {
						const prompt = "prompt" in asset ? asset.prompt : asset.description;
						const versions = props.versions.filter((version) => version.targetId === asset.id);
						const selected = selectedVersionForTarget(asset.id, props.versions, props.selections, "image");
						return (0, react_jsx_runtime.jsxs)("article", {
							className: "oh-story-asset-card",
							ref: props.selectedId === asset.id ? selectedRef : void 0,
							"data-selected": props.selectedId === asset.id || void 0,
							children: [
								selected === void 0 ? (0, react_jsx_runtime.jsx)("div", {
									className: "oh-story-asset-placeholder",
									children: asset.kind === "character" ? "人" : asset.kind === "scene" ? "景" : asset.kind === "prop" ? "物" : "设"
								}) : (0, react_jsx_runtime.jsx)(MediaPreview, { version: selected }),
								(0, react_jsx_runtime.jsxs)("div", { children: [
									(0, react_jsx_runtime.jsx)("small", { children: ASSET_KIND_LABEL[asset.kind] }),
									(0, react_jsx_runtime.jsx)("h3", { children: asset.title }),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											props.onNavigate({
												path: asset.path,
												offset: asset.offset,
												id: asset.id
											});
										},
										children: asset.id
									})
								] }),
								prompt !== void 0 && (0, react_jsx_runtime.jsx)("p", {
									className: "oh-story-asset-description",
									children: prompt
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "oh-story-card-actions",
									children: prompt !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											props.onCreateJob(asset.id, "image", prompt);
										},
										children: "准备素材"
									})
								}),
								versions.length > 0 && (0, react_jsx_runtime.jsx)(VersionStrip, {
									targetId: asset.id,
									versions,
									selections: props.selections,
									onSelectionsChange: props.onSelectionsChange
								})
							]
						}, asset.id);
					})
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: "oh-story-media-library",
					children: [
						(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: "项目媒体库" }), (0, react_jsx_runtime.jsxs)("span", { children: [
							library.length,
							"/",
							props.libraryVersions.length,
							" 项 · 可跨集复用"
						] })] }), (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索项目媒体",
							value: query,
							placeholder: "搜索 ID 或路径",
							onChange: (event) => {
								setQuery(event.target.value);
							}
						}), (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "筛选媒体类型",
							value: kind,
							onChange: (event) => {
								setKind(event.target.value);
							},
							children: [
								(0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: "全部"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "image",
									children: "图片"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "video",
									children: "视频"
								})
							]
						})] })] }),
						referenceTarget === void 0 && (0, react_jsx_runtime.jsx)("p", {
							className: "oh-story-projection-note",
							children: "先在镜头页选中一个镜头，再回到这里把已有图片设为该镜头的额外参考。"
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-media-library-grid",
							children: library.map((version) => {
								const selected = referenceTarget !== void 0 && (props.manualReferences[referenceTarget] ?? []).includes(version.id);
								return (0, react_jsx_runtime.jsxs)("article", { children: [
									(0, react_jsx_runtime.jsx)(MediaPreview, { version }),
									(0, react_jsx_runtime.jsx)("strong", { children: version.targetId }),
									(0, react_jsx_runtime.jsx)("span", {
										title: version.path,
										children: version.path
									}),
									(0, react_jsx_runtime.jsxs)("footer", { children: [version.path !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											props.onOpenMedia(version.path);
										},
										children: "打开文件"
									}), referenceTarget !== void 0 && version.kind === "image" && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-pressed": selected,
										"aria-label": `${selected ? "取消" : "设为"} ${referenceTarget} 参考 ${version.targetId}`,
										onClick: () => {
											toggleReference(version.id);
										},
										children: selected ? "已引用" : "作为参考"
									})] })
								] }, version.id);
							})
						})
					]
				})]
			});
		}
		function TaskBoard({ jobs, queue, sessionRunning, onCancel, onRemoveQueued }) {
			const activeJobId = activeProductionJobId(jobs, queue, sessionRunning);
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-task-board",
				children: [(0, react_jsx_runtime.jsx)("div", {
					className: "oh-story-projection-note",
					children: "图片与视频先预检、后确认。内置契约支持 GPT Image 2 / Seedance；实际账号、模型与可用性由当前 DSH 运行环境决定。"
				}), jobs.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
					className: "oh-story-production-empty",
					children: "还没有生产任务。可从镜头或素材页提交单个或批量任务。"
				}) : [...jobs].reverse().map((job) => {
					const queued = queuedItemForJob(job.id, queue);
					const displayStatus = queued === void 0 ? STATUS_LABELS[job.status] : "DSH Queue";
					return (0, react_jsx_runtime.jsxs)("article", {
						"data-job-id": job.id,
						"data-status": job.status,
						children: [
							(0, react_jsx_runtime.jsxs)("header", { children: [
								(0, react_jsx_runtime.jsx)("strong", {
									title: job.targetId,
									children: job.targetId
								}),
								(0, react_jsx_runtime.jsx)("span", { children: JOB_KIND_LABEL[job.kind] }),
								(0, react_jsx_runtime.jsx)("span", { children: displayStatus })
							] }),
							(0, react_jsx_runtime.jsx)("div", {
								className: "oh-story-task-progress",
								children: (0, react_jsx_runtime.jsx)("i", { style: { width: `${String(job.progress)}%` } })
							}),
							(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "查看投产提示词" }), (0, react_jsx_runtime.jsx)("p", { children: job.prompt })] }),
							job.expectedOutputs > 1 && (0, react_jsx_runtime.jsxs)("small", { children: [
								job.completedOutputs,
								"/",
								job.expectedOutputs,
								" 项成果"
							] }),
							job.error !== void 0 && (0, react_jsx_runtime.jsx)("div", {
								className: "oh-story-error",
								children: job.error
							}),
							job.output !== void 0 && (0, react_jsx_runtime.jsx)(MediaPreview, { version: job.output }),
							(0, react_jsx_runtime.jsxs)("footer", { children: [queued !== void 0 && (job.status === "awaiting_confirmation" || job.status === "pending" || job.status === "running") && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									onRemoveQueued(job, queued.id);
								},
								children: "从 DSH Queue 移除"
							}), activeJobId === job.id && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									onCancel(job);
								},
								children: "停止当前 DSH Turn"
							})] })
						]
					}, job.id);
				})]
			});
		}
		function SequenceBoard(props) {
			const issues = sequenceIssues(props.sequence, props.versions);
			const versionById = new Map(props.versions.map((version) => [version.id, version]));
			const move = (index, delta) => {
				const source = props.sequence[index];
				const target = props.sequence[index + delta];
				if (source !== void 0 && target !== void 0) props.onSequenceChange(reorderSequence(props.sequence, index, index + delta));
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "oh-story-sequence",
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "oh-story-sequence-summary",
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: [props.sequence.length, " 个镜头"] }),
							(0, react_jsx_runtime.jsx)("span", { children: props.sequence.length === 0 ? "还没有镜头" : issues.length === 0 ? "已可合成" : `${String(issues.length)} 个阻塞项` }),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: issues.length > 0 || props.sequence.length < 2,
								onClick: props.onCompose,
								children: "合成成片"
							})
						]
					}),
					issues.length > 0 && (0, react_jsx_runtime.jsxs)("ul", {
						className: "oh-story-sequence-issues",
						children: [issues.slice(0, 3).map((issue) => (0, react_jsx_runtime.jsx)("li", { children: issue }, issue)), issues.length > 3 && (0, react_jsx_runtime.jsxs)("li", { children: [
							"另有 ",
							issues.length - 3,
							" 个阻塞项，请在下方镜头行补齐视频。"
						] })]
					}),
					(0, react_jsx_runtime.jsx)("ol", { children: props.sequence.map((item, index) => {
						const version = item.versionId === void 0 ? void 0 : versionById.get(item.versionId);
						return (0, react_jsx_runtime.jsxs)("li", { children: [
							(0, react_jsx_runtime.jsx)("span", { children: String(index + 1).padStart(2, "0") }),
							version === void 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: "oh-story-sequence-missing",
								children: "缺少视频"
							}) : (0, react_jsx_runtime.jsx)(MediaPreview, {
								version,
								interactive: false
							}),
							(0, react_jsx_runtime.jsx)("strong", { children: item.shotId }),
							(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `上移 ${item.shotId}`,
								disabled: index === 0,
								onClick: () => {
									move(index, -1);
								},
								children: "↑"
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `下移 ${item.shotId}`,
								disabled: index === props.sequence.length - 1,
								onClick: () => {
									move(index, 1);
								},
								children: "↓"
							})] })
						] }, item.shotId);
					}) })
				]
			});
		}
		function ProductionCanvas(props) {
			return (0, react_jsx_runtime.jsx)(ManualCanvas, { ...props });
		}
		/** Scroll the card an Agent focus_target selected into view; without it the tab switches but the card stays off-screen. */
		function useScrollIntoView(selectedId) {
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				ref.current?.scrollIntoView({ block: "nearest" });
			}, [selectedId]);
			return ref;
		}
		function ReadinessBadge({ label, ready }) {
			return (0, react_jsx_runtime.jsxs)("span", {
				"data-ready": ready,
				"aria-label": `${label}${ready ? "已备" : "待补"}`,
				children: [(0, react_jsx_runtime.jsx)("i", {
					"aria-hidden": "true",
					children: ready ? "✓" : "—"
				}), label]
			});
		}
		function MissingDocument({ document, documentPaths, what, skill, onNavigate }) {
			const present = documentPaths.includes(document);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "oh-story-production-empty",
				children: [
					(0, react_jsx_runtime.jsxs)("strong", { children: [
						"还没有可投影的",
						what,
						"。"
					] }),
					(0, react_jsx_runtime.jsx)("p", { children: present ? `${document} 已存在，但没有解析出条目。请检查二级标题是否为稳定的 ID 形式。` : `本集还没有 ${document}。在右侧 Chat 用 ${skill} 写好这份文档后，这里会自动出现。` }),
					present && (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => {
							onNavigate({
								path: document,
								offset: 0,
								id: document
							});
						},
						children: ["打开 ", document.split("/").at(-1)]
					})
				]
			});
		}
		function ReferenceButton({ id, production, onNavigate }) {
			const target = production.targets.get(id);
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: target === void 0,
				onClick: (event) => {
					event.stopPropagation();
					if (target !== void 0) onNavigate(target);
				},
				children: id
			});
		}
		function MediaPreview({ version, interactive = true }) {
			return version.kind === "image" ? (0, react_jsx_runtime.jsx)("img", {
				className: "oh-story-media-preview",
				src: version.url,
				alt: version.targetId,
				loading: "lazy"
			}) : (0, react_jsx_runtime.jsx)("video", {
				className: "oh-story-media-preview",
				src: version.url,
				controls: interactive,
				muted: !interactive,
				preload: "metadata"
			});
		}
		function VersionStrip({ targetId, versions, selections, onSelectionsChange }) {
			const selected = selectedVersionForTarget(targetId, versions, selections)?.id;
			return (0, react_jsx_runtime.jsx)("div", {
				className: "oh-story-version-strip",
				"aria-label": `${targetId} 成果版本`,
				children: versions.map((version, index) => (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-pressed": version.id === selected,
					"aria-label": `选择 ${targetId} 版本 ${String(index + 1)}`,
					"data-selected": version.id === selected || void 0,
					onClick: (event) => {
						event.stopPropagation();
						onSelectionsChange({
							...selections,
							[targetId]: version.id
						});
					},
					children: [(0, react_jsx_runtime.jsx)(MediaPreview, {
						version,
						interactive: false
					}), (0, react_jsx_runtime.jsxs)("span", { children: ["V", String(index + 1)] })]
				}, version.id))
			});
		}
		//#endregion
		//#region lib/types/client/canvas-document.js
		/** Project-owned canvas document, serialized optimistic writes with visible conflict recovery. */
		function CanvasDocument(props) {
			const [state, setState] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)("正在读取画布…");
			const [ready, setReady] = (0, react.useState)(false);
			const [revision, setRevision] = (0, react.useState)(0);
			const io = (0, react.useRef)({
				version: null,
				busy: false,
				failed: false,
				active: true
			});
			const url = `/oh-story/canvas?sessionId=${encodeURIComponent(props.sessionId)}&path=${encodeURIComponent(props.production.episodeDirectory)}`;
			(0, react.useEffect)(() => {
				const current = {
					version: null,
					busy: false,
					failed: false,
					active: true
				};
				io.current = current;
				setReady(false);
				fetch(url).then(async (response) => {
					const data = await response.json();
					if (!response.ok) throw new Error(data.error ?? "画布读取失败");
					if (!current.active) return;
					if (data.state !== null && (!Array.isArray(data.state?.links) || typeof data.state?.positions !== "object" || data.state.positions === null)) throw new Error("画布文件格式错误");
					current.version = data.version;
					setState(data.state);
					setReady(true);
					setStatus("画布已同步");
				}).catch((error) => {
					if (current.active) {
						current.failed = true;
						setStatus(String(error));
					}
				});
				return () => {
					current.active = false;
				};
			}, [url, revision]);
			const save = (next) => {
				const current = io.current;
				if (!ready || current.failed) return;
				setState(next);
				current.pending = next;
				if (current.busy) return;
				current.busy = true;
				setStatus("正在保存画布…");
				(async () => {
					try {
						while (current.pending !== void 0) {
							const submitted = current.pending;
							delete current.pending;
							const response = await fetch(url, {
								method: "PUT",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({
									state: submitted,
									version: current.version
								})
							});
							const data = await response.json();
							if (!response.ok) throw new Error(data.error ?? "画布保存失败");
							current.version = data.version;
						}
						if (current.active) setStatus("画布已保存到剧集目录");
					} catch (error) {
						current.failed = true;
						if (current.active) {
							setReady(false);
							setStatus(`${String(error)}；请重新读取后再编辑，未保存的更改不会覆盖服务器文件。`);
						}
					} finally {
						current.busy = false;
					}
				})();
			};
			const links = state?.links ?? props.production.shots.flatMap((shot) => shot.references.map((reference) => [reference, shot.id]));
			const positions = state?.positions ?? props.canvas;
			const assetIds = new Set([...props.production.assets, ...props.production.visualAssets].map((asset) => asset.id));
			const production = state === null ? props.production : {
				...props.production,
				shots: props.production.shots.map((shot) => ({
					...shot,
					references: links.filter(([from, to]) => to === shot.id && assetIds.has(from)).map(([from]) => from)
				}))
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("div", {
				role: "status",
				children: [status, !ready && (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setRevision((value) => value + 1),
					children: "重新读取画布"
				})]
			}), ready && (0, react_jsx_runtime.jsx)(DramaProductionView, {
				...props,
				production,
				canvas: positions,
				canvasLinks: links,
				onCanvasChange: (next) => save({
					positions: next,
					links: [...links]
				}),
				onCanvasLinksChange: (next) => save({
					positions: { ...positions },
					links: next
				})
			})] });
		}
		//#endregion
		//#region lib/types/client/production-intent.js
		const OH_STORY_PRODUCTION_TOOL_NAME = "oh_story_production";
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
		//#region lib/types/client/production-intents.js
		function parsedIntent(block) {
			if (!("kind" in block) || block.isError || block.call?.name !== "oh_story_production") return void 0;
			try {
				const args = JSON.parse(block.call.argsRaw);
				return {
					callId: block.callId,
					intent: validateProductionIntent(args)
				};
			} catch {
				return;
			}
		}
		function visit(block, output) {
			const direct = parsedIntent(block);
			if (direct !== void 0) output.push(direct);
			for (const child of block.subCalls) visit(child, output);
		}
		/** Replay durable successful Agent UI intents in official DSH Chat order. */
		function settledProductionIntents(chat) {
			const output = [];
			for (const key of chat.order) {
				const node = chat.nodes.get(key);
				if (node?.kind !== "tool-call") continue;
				const root = node.data.root;
				if (root !== void 0) visit(root, output);
			}
			return output;
		}
		//#endregion
		//#region \0dsh-inline-css:C:\Users\ASUS\Desktop\A-deepblue\907harness\packages\client\ui-oh-story\src\client\plugin.css.mjs
		var plugin_css_default = ".oh-story-bridge-marker{display:none}.oh-story-split-surface{font-family:var(--dsw-font-family);display:contents}[data-conversation-scroll]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface){--os-border:var(--dsw-alias-border-l2);--os-muted:var(--dsw-alias-label-secondary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);scrollbar-gutter:stable;min-height:0;scroll-padding-bottom:calc(var(--dsh-composer-height,152px) + 16px);grid-template-rows:minmax(0,1fr);grid-template-columns:clamp(184px,16%,200px) minmax(240px,1fr) clamp(408px,40%,520px);display:grid;position:relative;overflow:hidden auto}[data-conversation-scroll]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface)>[data-slot=conversation\\.session]>:not(.oh-story-split-surface){border-left:1px solid var(--os-border);grid-area:1/3;min-width:0;min-height:100%}[data-conversation-scroll]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface) [data-chat-flow]{padding-bottom:calc(var(--dsh-composer-height,152px) + 16px)}[data-conversation-scroll]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface)>[data-composer-seat]{width:100%;min-width:0;top:calc(var(--oh-story-scroll-height,720px) - var(--dsh-composer-height,152px));grid-area:1/3;align-self:start;position:sticky;bottom:auto}.oh-story-tree,.oh-story-editor{box-sizing:border-box;min-width:0;height:100%;min-height:0;color:inherit;background:var(--dsw-alias-bg-base);grid-row:1;align-self:start;position:sticky;top:0}.oh-story-tree{border-right:1px solid var(--os-border);background:var(--dsw-specific-sidebar-fill);grid-column:1;padding:14px 10px 24px;overflow:auto}.oh-story-editor{flex-direction:column;grid-column:2;display:flex;overflow:hidden}.oh-story-brand,.oh-story-editor header,.oh-story-role summary{justify-content:space-between;align-items:center;gap:12px;display:flex}.oh-story-brand{white-space:nowrap;gap:8px;min-height:28px;padding:0 5px 8px 7px;font-size:14px;font-weight:500}.oh-story-brand-cluster{align-items:center;gap:6px;min-width:0;display:flex}.oh-story-brand-cluster strong{text-overflow:ellipsis;white-space:nowrap;font:inherit;overflow:hidden}.oh-story-kind{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-button-ghost-active-fill);border-radius:5px;flex:none;padding:1px 6px;font-size:11px;font-weight:500;line-height:16px}.oh-story-brand button,.oh-story-save,.oh-story-role button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);cursor:pointer;font:inherit;border-radius:999px;padding:3px 9px}.oh-story-brand button{background:0 0;border:0;place-items:center;width:28px;height:28px;padding:0;font-size:16px;display:grid}.oh-story-brand button:hover,.oh-story-save:hover:not(:disabled),.oh-story-role button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.oh-story-brand button:focus-visible,.oh-story-save:focus-visible,.oh-story-mode-tabs button:focus-visible,.oh-story-editor-tabs button:focus-visible,.oh-story-tree nav button:focus-visible,.oh-story-role button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.oh-story-save:disabled{opacity:.48;cursor:default}.oh-story-mode-tabs{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:7px;margin:0 4px 8px;padding:2px;display:flex}.oh-story-mode-tabs button,.oh-story-editor-tabs button{min-height:24px;color:var(--os-muted);cursor:pointer;font:inherit;background:0 0;border:0;border-radius:5px;flex:1;font-size:11px;position:relative}.oh-story-mode-tabs button:hover,.oh-story-editor-tabs button:hover{color:var(--dsw-alias-label-primary)}.oh-story-mode-tabs button[aria-selected=true],.oh-story-editor-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-weight:500;box-shadow:0 1px 2px #00000014}.oh-story-file-group,.oh-story-file-folder{margin:0}.oh-story-file-group>summary,.oh-story-file-folder>summary{min-height:26px;color:var(--os-muted);cursor:pointer;border-radius:6px;align-items:center;gap:5px;padding:0 7px;font-size:11px;font-weight:600;list-style:none;display:flex}.oh-story-file-folder>summary{padding-left:min(calc(7px + var(--oh-story-indent,0px)), 49px)}.oh-story-file-group>summary{margin-top:3px}.oh-story-file-group>summary::-webkit-details-marker,.oh-story-file-folder>summary::-webkit-details-marker{display:none}.oh-story-file-group>summary:before,.oh-story-file-folder>summary:before{content:\"›\";width:8px;transition:transform .12s;transform:rotate(0)}.oh-story-file-group[open]>summary:before,.oh-story-file-folder[open]>summary:before{transform:rotate(90deg)}.oh-story-file-group>summary:hover,.oh-story-file-folder>summary:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.oh-story-file-group>summary span,.oh-story-file-folder>summary span{color:var(--dsw-alias-label-secondary);margin-left:auto;font-weight:400}.oh-story-tree nav button{width:100%;padding:6px 8px 6px min(calc(14px + var(--oh-story-indent,0px)), 56px);color:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font:inherit;background:0 0;border:0;border-radius:6px;font-size:12px;display:block;overflow:hidden}.oh-story-tree nav button:hover{background:var(--dsw-alias-interactive-bg-hover)}.oh-story-tree nav button[aria-current=page]{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary)}.oh-story-tree nav button[data-agent-target]{box-shadow:inset 2px 0 var(--dsw-alias-state-business-primary)}.oh-story-editor>header{border-bottom:1px solid var(--os-border);flex:none;min-height:44px;padding:0 14px}.oh-story-editor-path{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--os-muted);flex:1;font-size:12px;overflow:hidden}.oh-story-editor-path>span{text-overflow:ellipsis;display:block;overflow:hidden}.oh-story-editor-path>strong{text-overflow:ellipsis;font:inherit;display:none;overflow:hidden}.oh-story-editor-actions{flex:none;align-items:center;gap:8px;display:flex}.oh-story-editor-tabs{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:7px;padding:2px;display:flex}.oh-story-editor-tabs button{border-radius:5px;min-height:24px;padding:0 9px;font-size:11px}.oh-story-save{min-height:28px}.oh-story-editor textarea{box-sizing:border-box;resize:none;width:100%;min-height:0;color:var(--dsw-alias-label-primary);background:0 0;border:0;outline:0;flex:1;padding:clamp(20px,6%,48px) clamp(22px,10%,84px) 48px;font:16px/1.9 ui-serif,Songti SC,STSong,Georgia,serif}.oh-story-editor textarea[data-format=structured]{tab-size:2;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.oh-story-markdown{box-sizing:border-box;width:100%;min-height:0;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;flex:1;padding:clamp(24px,8%,56px) clamp(24px,10%,92px) 64px;font:16px/1.85 ui-serif,Songti SC,STSong,Georgia,serif;overflow:auto}.oh-story-markdown>:first-child{margin-top:0}.oh-story-markdown>:last-child{margin-bottom:0}.oh-story-markdown h1,.oh-story-markdown h2,.oh-story-markdown h3,.oh-story-markdown h4,.oh-story-markdown h5,.oh-story-markdown h6{font-family:var(--dsw-font-family);letter-spacing:-.01em;margin:1.45em 0 .6em;line-height:1.35}.oh-story-markdown h1{font-size:1.75em}.oh-story-markdown h2{border-bottom:1px solid var(--os-border);padding-bottom:.35em;font-size:1.35em}.oh-story-markdown h3{font-size:1.15em}.oh-story-markdown p{margin:.75em 0}.oh-story-markdown ul,.oh-story-markdown ol{margin:.75em 0;padding-left:1.6em}.oh-story-markdown li{margin:.28em 0}.oh-story-markdown .oh-story-task-item{margin-left:-1.35em;list-style:none}.oh-story-task-item input{accent-color:var(--dsw-alias-state-business-primary);margin:0 .55em 0 0}.oh-story-markdown blockquote{border-left:3px solid var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-secondary);margin:1em 0;padding:.1em 1em}.oh-story-markdown code{background:var(--dsw-alias-markdown-inline-code);border-radius:4px;padding:.15em .4em;font:.86em/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.oh-story-markdown pre{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);border-radius:10px;margin:1em 0;padding:14px 16px;overflow:auto}.oh-story-markdown pre code{background:0 0;padding:0}.oh-story-markdown a{color:var(--dsw-alias-state-business-primary);text-underline-offset:3px;text-decoration-thickness:1px}.oh-story-markdown del{color:var(--os-muted)}.oh-story-markdown-table{border:1px solid var(--os-border);border-radius:10px;margin:1em 0;overflow-x:auto}.oh-story-markdown table{border-collapse:collapse;width:100%;font-family:ui-sans-serif,system-ui,PingFang SC,sans-serif;font-size:13px;line-height:1.55}.oh-story-markdown th,.oh-story-markdown td{border-right:1px solid var(--os-border);border-bottom:1px solid var(--os-border);vertical-align:top;min-width:96px;padding:9px 12px}.oh-story-markdown th:last-child,.oh-story-markdown td:last-child{border-right:0}.oh-story-markdown tbody tr:last-child td{border-bottom:0}.oh-story-markdown th{background:var(--dsw-alias-bg-layer-1);font-weight:600}.oh-story-markdown hr{border:0;border-top:1px solid var(--os-border);margin:2em 0}.oh-story-markdown-empty{color:var(--os-muted);margin:auto;font-size:13px}.oh-story-jsonl{box-sizing:border-box;width:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;display:flex;overflow:hidden}.oh-story-jsonl-summary{border-bottom:1px solid var(--os-border);flex:none;align-items:center;gap:10px;min-height:42px;padding:0 18px;font-size:12px;display:flex}.oh-story-jsonl-summary strong{font-weight:600}.oh-story-jsonl-summary span{color:var(--os-muted)}.oh-story-jsonl-records{padding:14px 18px 36px;overflow:auto}.oh-story-jsonl details,.oh-story-jsonl-error{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:10px;margin-bottom:10px;overflow:hidden}.oh-story-jsonl summary{cursor:pointer;min-height:42px;font:12px/1.4 var(--dsw-font-family);align-items:center;gap:9px;padding:0 12px;list-style:none;display:flex}.oh-story-jsonl summary::-webkit-details-marker{display:none}.oh-story-jsonl summary:before{content:\"›\";color:var(--os-muted);font-size:16px;transition:transform .12s}.oh-story-jsonl details[open] summary:before{transform:rotate(90deg)}.oh-story-jsonl summary>span{color:var(--os-muted);font-variant-numeric:tabular-nums;flex:none}.oh-story-jsonl summary>strong{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:80px;font-weight:600;overflow:hidden}.oh-story-jsonl summary>code,.oh-story-jsonl summary>em{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-secondary);border-radius:5px;flex:none;padding:2px 6px;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}.oh-story-jsonl pre{border-top:1px solid var(--os-border);background:var(--dsw-alias-markdown-code-block);max-height:520px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:14px 16px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;overflow:auto}.oh-story-jsonl-error{border-color:var(--dsw-alias-state-error-primary);gap:5px;padding:12px;font-size:12px;display:grid}.oh-story-jsonl-error>strong{color:var(--dsw-alias-state-error-primary)}.oh-story-jsonl-error>span{color:var(--os-muted)}.oh-story-jsonl-error pre{margin:3px -12px -12px}.oh-story-stream,.oh-story-conflict,.oh-story-warning{border-bottom:1px solid var(--os-border);flex:none;padding:7px 12px;font-size:11px;line-height:1.4}.oh-story-stream{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-button-ghost-active-fill)}.oh-story-stream[data-stage=streaming]{animation:1.2s ease-in-out infinite alternate oh-story-pulse}.oh-story-conflict{color:var(--dsw-alias-state-warn-label);background:var(--dsw-specific-tip)}.oh-story-conflict>div{gap:6px;margin-top:6px;display:flex}.oh-story-conflict button,.oh-story-empty button{border:1px solid var(--os-border);color:inherit;background:var(--dsw-alias-bg-base);cursor:pointer;font:inherit;border-radius:6px;padding:3px 8px}.oh-story-warning{color:var(--dsw-alias-state-warn-label);background:var(--dsw-specific-tip)}@keyframes oh-story-pulse{to{opacity:.62}}@media (prefers-reduced-motion:reduce){.oh-story-stream[data-stage=streaming]{animation:none}}.oh-story-empty{max-width:480px;color:var(--os-muted);text-align:center;margin:auto;padding:30px;line-height:1.7}.oh-story-error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-specific-tip);border-radius:8px;margin:8px;padding:8px 10px;font-size:12px}.oh-story-role{flex-direction:column;margin:0;display:flex;overflow:hidden}.oh-story-role summary{cursor:pointer;min-height:24px;padding:0;font-size:14px;line-height:24px;list-style:none}.oh-story-role summary::-webkit-details-marker{display:none}.oh-story-role summary span{color:var(--dsw-alias-state-business-primary)}.oh-story-role summary strong{color:var(--dsw-alias-label-secondary);margin-right:auto;font-weight:500}.oh-story-role summary em{color:var(--dsw-alias-label-caption);font-size:12px;font-style:normal}.oh-story-role[data-state=error] summary em{color:var(--dsw-alias-state-error-primary)}.oh-story-role pre{border:1px solid var(--dsw-alias-border-l1);max-height:260px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-markdown-code-block);white-space:pre-wrap;font:var(--dsw-font-markdown-code-block-small);border-radius:12px;margin:4px 0 4px 4px;padding:12px 16px;overflow:auto}.oh-story-role>button{align-self:flex-start;margin:4px 0 2px 4px;font-size:11px}.oh-story-production{background:var(--dsw-alias-bg-base);min-height:0;font:12px/1.5 var(--dsw-font-family);flex:1;overflow:auto}.oh-story-production button,.oh-story-production select{border:1px solid var(--os-border);color:inherit;background:var(--dsw-alias-bg-base);cursor:pointer;font:inherit;border-radius:6px;padding:4px 8px}.oh-story-production button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.oh-story-production button:disabled{opacity:.45;cursor:default}.oh-story-production button:focus-visible,.oh-story-canvas article:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.oh-story-production-bar,.oh-story-production-notice,.oh-story-production-actions,.oh-story-sequence-summary{align-items:center;gap:8px;display:flex}.oh-story-production-bar{z-index:5;box-sizing:border-box;border-bottom:1px solid var(--os-border);background:color-mix(in srgb, var(--dsw-alias-bg-base) 94%, transparent);backdrop-filter:blur(12px);justify-content:space-between;min-height:44px;padding:6px 12px;position:sticky;top:0}.oh-story-production-tabs{align-self:stretch;gap:16px;display:flex}.oh-story-production-tabs button{color:var(--os-muted);background:0 0;border:0;border-radius:0;padding:0;position:relative}.oh-story-production-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary)}.oh-story-production-tabs button[aria-selected=true]:after{background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:2px;height:2px;position:absolute;bottom:-6px;left:0;right:0}.oh-story-production-meta{align-items:center;gap:8px;display:flex}.oh-story-production-meta>button{color:var(--os-muted);padding-block:2px}.oh-story-production-summary{color:var(--os-muted);white-space:nowrap}.oh-story-production-notice{border:1px solid var(--os-border);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-radius:7px;justify-content:space-between;margin:8px 12px 0;padding:7px 9px}.oh-story-production-notice button{background:0 0;border:0}.oh-story-production-diagnostics{border:1px solid var(--dsw-alias-state-warn-label);background:var(--dsw-specific-tip);border-radius:7px;margin:8px 12px 0;padding:7px 9px}.oh-story-production-diagnostics summary{color:var(--dsw-alias-state-warn-label);cursor:pointer}.oh-story-production-diagnostics ul{gap:4px;margin:8px 0 0;padding:0;list-style:none;display:grid}.oh-story-production-diagnostics li{color:var(--dsw-alias-label-secondary);grid-template-columns:auto minmax(0,1fr);align-items:start;gap:6px;display:grid}.oh-story-production-diagnostics li[data-severity=error]{color:var(--dsw-alias-state-error-primary)}.oh-story-production-diagnostics li button{color:inherit;text-align:left;background:0 0;border:0;padding:0}.oh-story-production-diagnostics p{color:var(--os-muted);margin:6px 0 0}.oh-story-production-actions{justify-content:flex-end;margin-bottom:12px}.oh-story-production-actions button:last-child,.oh-story-sequence-summary button{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}.oh-story-shot-board{padding:16px 12px}.oh-story-shot-grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));align-items:start;gap:12px;display:grid}.oh-story-shot-card,.oh-story-asset-card,.oh-story-task-board>article{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:10px;min-width:0;overflow:hidden}.oh-story-shot-card{cursor:default;padding:10px;transition:border-color .15s,background-color .15s}.oh-story-shot-card:hover{border-color:var(--dsw-alias-border-l2)}.oh-story-shot-card{cursor:pointer}.oh-story-shot-card:focus-visible,.oh-story-asset-card:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.oh-story-shot-card[data-selected],.oh-story-asset-card[data-selected]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 4%, var(--dsw-alias-bg-layer-1))}.oh-story-shot-card>header,.oh-story-task-board article>header{border:0;align-items:center;gap:8px;min-height:0;padding:0;display:flex}.oh-story-shot-card>header>button{min-width:0;color:var(--dsw-alias-state-business-primary);text-align:left;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:0;flex:1;padding:0;overflow:hidden}.oh-story-shot-card>header>span{color:var(--os-muted);font-variant-numeric:tabular-nums}.oh-story-shot-card h3,.oh-story-asset-card h3{margin:7px 0 4px;font-size:13px;font-weight:600}.oh-story-shot-card>p,.oh-story-asset-card>p,.oh-story-task-board article>p{color:var(--os-muted);margin:5px 0}.oh-story-shot-placeholder{height:132px;color:var(--os-muted);background:var(--dsw-alias-button-ghost-active-fill);text-align:center;border-radius:7px;place-content:center;gap:3px;margin-bottom:8px;display:grid}.oh-story-shot-placeholder strong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:22px}.oh-story-shot-card dl{grid-template-columns:20px minmax(0,1fr);margin:7px 0;display:grid}.oh-story-shot-card dt{color:var(--dsw-alias-state-business-primary)}.oh-story-shot-card dd{overflow-wrap:anywhere;min-width:0;margin:0}.oh-story-shot-status,.oh-story-reference-links,.oh-story-card-actions{flex-wrap:wrap;gap:5px;margin-top:7px;display:flex}.oh-story-shot-status span{color:var(--os-muted);background:var(--dsw-alias-button-ghost-active-fill);border-radius:5px;padding:1px 5px}.oh-story-shot-status span[data-ready=true]{color:var(--dsw-alias-state-business-primary)}.oh-story-shot-status span>i{margin-right:3px;font-style:normal}.oh-story-reference-links button{max-width:100%;color:var(--dsw-alias-state-business-primary);text-overflow:ellipsis;background:0 0;border:0;padding:1px 5px;overflow:hidden}.oh-story-card-actions{border-top:1px solid var(--os-border);padding-top:8px}.oh-story-card-actions button{flex:1;padding-block:4px}.oh-story-card-actions button:last-child{color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--os-border))}.oh-story-media-preview{background:var(--dsw-alias-bg-base);object-fit:contain;border-radius:7px;width:100%;height:168px;display:block}.oh-story-media-document{flex:1;place-items:center;min-height:0;padding:24px;display:grid;overflow:auto}.oh-story-media-document img,.oh-story-media-document video{object-fit:contain;max-width:100%;max-height:100%;display:block}.oh-story-media-document audio{width:min(520px,100%)}.oh-story-version-strip{border-top:1px solid var(--os-border);gap:5px;margin-top:8px;padding-top:8px;display:flex;overflow-x:auto}.oh-story-version-strip>button{width:64px;min-width:64px;padding:2px;position:relative}.oh-story-version-strip>button[data-selected]{border-color:var(--dsw-alias-state-business-primary)}.oh-story-version-strip .oh-story-media-preview{height:72px}.oh-story-version-strip span{background:var(--dsw-alias-bg-base);border-radius:3px;padding:0 3px;font-size:10px;position:absolute;bottom:3px;right:3px}.oh-story-asset-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding:16px 12px;display:grid}.oh-story-asset-card{padding:10px}.oh-story-asset-card>div:nth-child(2)>button{max-width:100%;color:var(--dsw-alias-state-business-primary);text-overflow:ellipsis;background:0 0;border:0;padding:0;overflow:hidden}.oh-story-asset-card small{color:var(--os-muted);text-transform:uppercase}.oh-story-asset-placeholder{height:112px;color:var(--os-muted);background:var(--dsw-alias-button-ghost-active-fill);border-radius:7px;place-items:center;font-size:28px;display:grid}.oh-story-asset-description{-webkit-line-clamp:5;line-clamp:5;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.oh-story-media-library{border-top:1px solid var(--os-border);margin:0 12px 14px;padding-top:12px}.oh-story-media-library>header{justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;display:flex}.oh-story-media-library>header>div{align-items:center;gap:7px;display:flex}.oh-story-media-library>header span{color:var(--os-muted)}.oh-story-media-library input{box-sizing:border-box;border:1px solid var(--os-border);width:180px;color:inherit;background:var(--dsw-alias-bg-base);font:inherit;border-radius:6px;padding:5px 8px}.oh-story-media-library>.oh-story-projection-note{margin-bottom:10px}.oh-story-media-library-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;display:grid}.oh-story-media-library-grid>article{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex-direction:column;gap:5px;min-width:0;padding:7px;display:flex}.oh-story-media-library-grid .oh-story-media-preview{height:116px}.oh-story-media-library-grid>article>span{color:var(--os-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.oh-story-media-library-grid footer{gap:4px;margin-top:auto;display:flex}.oh-story-media-library-grid footer button{flex:1;min-width:0;padding-inline:4px}.oh-story-media-library-grid footer button[aria-pressed=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}.oh-story-task-board{gap:10px;padding:12px;display:grid}.oh-story-task-board>article{padding:11px}.oh-story-task-board>article[data-status=dispatched_unknown]{border-color:var(--dsw-alias-state-warn-label)}.oh-story-task-board>article[data-status=dispatched_unknown] .oh-story-error{color:var(--dsw-alias-state-warn-label);background:var(--dsw-specific-tip)}.oh-story-task-board article>header strong{text-overflow:ellipsis;flex:1;min-width:0;overflow:hidden}.oh-story-task-board article>header span{color:var(--os-muted);background:var(--dsw-alias-button-ghost-active-fill);border-radius:5px;padding:1px 5px}.oh-story-task-progress{background:var(--os-border);border-radius:3px;height:3px;margin-top:8px;overflow:hidden}.oh-story-task-progress i{background:var(--dsw-alias-state-business-primary);height:100%;transition:width .2s;display:block}.oh-story-task-board details{color:var(--os-muted);margin-top:8px}.oh-story-task-board details summary{cursor:pointer}.oh-story-task-board details p{background:var(--dsw-alias-bg-base);white-space:pre-wrap;border-radius:6px;max-height:120px;margin:6px 0;padding:8px;overflow:auto}.oh-story-task-board footer{flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-top:8px;display:flex}.oh-story-projection-note{border:1px solid var(--os-border);color:var(--os-muted);background:var(--dsw-alias-bg-layer-1);border-radius:7px;padding:7px 10px}.oh-story-task-board>.oh-story-projection-note{margin-bottom:0}.oh-story-production-empty{color:var(--os-muted);text-align:center;padding:48px 20px}.oh-story-production-empty strong{color:var(--dsw-alias-text-1);margin-bottom:6px;font-size:13px;display:block}.oh-story-production-empty p{max-width:44em;margin:0 auto;line-height:1.6}.oh-story-production-empty button{margin-top:12px}.oh-story-sequence{padding:12px}.oh-story-sequence-summary{justify-content:space-between;margin-bottom:10px}.oh-story-sequence-summary span{color:var(--os-muted);margin-left:auto}.oh-story-sequence-issues{color:var(--dsw-alias-state-warn-label);background:var(--dsw-specific-tip);border-radius:7px;margin:0 0 10px;padding:8px 8px 8px 28px}.oh-story-sequence-issues li+li{margin-top:2px}.oh-story-sequence ol{gap:6px;margin:0;padding:0;list-style:none;display:grid}.oh-story-sequence>ol>li{border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);border-radius:8px;grid-template-columns:28px 96px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:70px;padding:7px;display:grid}.oh-story-sequence>ol>li>span{color:var(--os-muted);font-variant-numeric:tabular-nums}.oh-story-sequence>ol>li .oh-story-media-preview,.oh-story-sequence-missing{width:96px;height:54px}.oh-story-sequence-missing{color:var(--os-muted);background:var(--dsw-alias-button-ghost-active-fill);border-radius:5px;place-items:center;display:grid}.oh-story-sequence>ol>li>div:last-child{gap:3px;display:flex}.oh-story-canvas-shell{flex-direction:column;height:max(580px,100% - 84px);min-height:580px;display:flex;position:relative;overflow:hidden}.oh-story-canvas-shell>.oh-story-projection-note{z-index:3;flex:none;margin:8px 168px 8px 8px}.oh-story-canvas-controls{z-index:4;border:1px solid var(--os-border);background:var(--dsw-alias-bg-base);border-radius:8px;align-items:center;gap:3px;padding:3px;display:flex;position:absolute;top:8px;right:8px}.oh-story-canvas-controls span{min-width:44px;color:var(--os-muted);text-align:center}.oh-story-canvas-viewport{background-color:var(--dsw-alias-bg-base);background-image:radial-gradient(var(--os-border) 1px, transparent 1px);background-size:20px 20px;flex:1;width:100%;min-height:0;overflow:auto}.oh-story-canvas{transform-origin:0 0;width:1800px;height:1800px;position:relative}.oh-story-canvas svg{pointer-events:none;width:100%;height:100%;position:absolute;inset:0;overflow:visible}.oh-story-canvas marker polygon{fill:var(--dsw-alias-border-l2)}.oh-story-canvas g[data-active] marker polygon{fill:var(--dsw-alias-state-business-primary)}.oh-story-canvas-edge{fill:none;opacity:.55;stroke:var(--dsw-alias-border-l2);stroke-width:2px}.oh-story-canvas g[data-active] .oh-story-canvas-edge{opacity:.9;stroke:var(--dsw-alias-state-business-primary)}.oh-story-canvas-edge-hit{fill:none;stroke:#0000;stroke-width:18px;pointer-events:stroke;cursor:grab;touch-action:none}.oh-story-canvas-edge-hit:active{cursor:grabbing}.oh-story-canvas-edge-hit:focus-visible{stroke:color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent);outline:none}.oh-story-canvas-edge-handle{fill:var(--dsw-alias-bg-layer-1);opacity:.8;stroke:var(--dsw-alias-state-business-primary);stroke-width:2px;pointer-events:none}.oh-story-canvas article{box-sizing:border-box;border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1);cursor:grab;user-select:none;touch-action:none;border-radius:8px;flex-direction:column;gap:4px;width:180px;min-height:76px;padding:10px;display:flex;position:absolute;box-shadow:0 4px 14px #00000014}.oh-story-canvas article:active{cursor:grabbing}.oh-story-canvas article[data-node-type=shot]{border-color:var(--dsw-alias-state-business-primary)}.oh-story-canvas article[data-selected]{box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent), 0 4px 14px #00000014}.oh-story-canvas article small{color:var(--os-muted);text-transform:uppercase}.oh-story-canvas article strong,.oh-story-canvas article span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.oh-story-canvas article span{color:var(--os-muted);font-size:10px}[data-conversation-scroll][data-oh-story-layout=medium]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface){grid-template-columns:clamp(104px,18%,184px) minmax(200px,1fr) clamp(300px,45%,408px)}[data-conversation-scroll][data-oh-story-layout=compact]:has(>[data-slot=conversation\\.session]>.oh-story-split-surface){grid-template-columns:clamp(80px,16%,104px) minmax(0,1fr) clamp(228px,48%,300px)}[data-oh-story-layout=medium] .oh-story-file-folder>summary{padding-left:min(calc(7px + var(--oh-story-indent,0px)), 35px)}[data-oh-story-layout=medium] .oh-story-tree nav button{padding-left:min(calc(14px + var(--oh-story-indent,0px)), 42px)}[data-oh-story-layout=medium] .oh-story-editor textarea{padding-left:28px;padding-right:28px}[data-oh-story-layout=compact] .oh-story-tree{padding-inline:4px}[data-oh-story-layout=compact] .oh-story-brand{gap:4px;padding-inline:2px;font-size:11px}[data-oh-story-layout=compact] .oh-story-brand-cluster{gap:4px}[data-oh-story-layout=compact] .oh-story-brand-cluster strong>span{display:none}[data-oh-story-layout=compact] .oh-story-kind{padding-inline:4px;font-size:11px}[data-oh-story-layout=compact] .oh-story-brand button{width:24px;height:24px}[data-oh-story-layout=compact] .oh-story-mode-tabs{margin-inline:0}[data-oh-story-layout=compact] .oh-story-mode-tabs button{padding-inline:3px;font-size:11px}[data-oh-story-layout=compact] .oh-story-file-folder>summary{padding-left:min(calc(5px + var(--oh-story-indent,0px)), 19px)}[data-oh-story-layout=compact] .oh-story-tree nav button{padding-right:4px;padding-left:min(calc(7px + var(--oh-story-indent,0px)), 21px)}[data-oh-story-layout=compact] .oh-story-editor>header{grid-template-rows:24px 36px;grid-template-columns:minmax(0,1fr);align-content:center;gap:0;min-height:68px;padding:4px 3px;display:grid}[data-oh-story-layout=compact] .oh-story-editor-path>span{display:none}[data-oh-story-layout=compact] .oh-story-editor-path>strong{font-size:11px;line-height:24px;display:block}[data-oh-story-layout=compact] .oh-story-editor-actions{justify-content:flex-end;gap:4px;width:100%;min-width:0}[data-oh-story-layout=compact] .oh-story-editor-tabs{flex:1;min-width:0}[data-oh-story-layout=compact] .oh-story-editor-tabs button{white-space:nowrap;min-width:0;padding-inline:2px}[data-oh-story-layout=compact] .oh-story-save{white-space:nowrap;flex:none;padding-inline:4px;font-size:11px}[data-oh-story-layout=compact] .oh-story-editor textarea{padding:16px 12px 40px}[data-oh-story-layout=compact] .oh-story-markdown{padding:18px 12px 48px}[data-oh-story-layout=compact] .oh-story-jsonl-summary{padding-inline:10px}[data-oh-story-layout=compact] .oh-story-jsonl-records{padding:8px 7px 28px}[data-oh-story-layout=compact] .oh-story-jsonl summary{gap:6px;padding-inline:7px}[data-oh-story-layout=compact] .oh-story-jsonl summary>span{display:none}[data-oh-story-layout=compact] .oh-story-jsonl summary>strong{min-width:32px}[data-oh-story-layout=compact] .oh-story-jsonl summary>code,[data-oh-story-layout=compact] .oh-story-jsonl summary>em,[data-oh-story-layout=compact] .oh-story-production-summary{display:none}[data-oh-story-layout=compact] .oh-story-production-bar{flex-wrap:wrap;padding-inline:4px}[data-oh-story-layout=compact] .oh-story-production-tabs{gap:0;width:100%}[data-oh-story-layout=compact] .oh-story-production-tabs button{flex:1;min-width:0;padding-inline:0;font-size:11px}[data-oh-story-layout=compact] .oh-story-production-meta{justify-content:flex-end;width:100%}[data-oh-story-layout=compact] .oh-story-shot-grid,[data-oh-story-layout=compact] .oh-story-asset-grid{grid-template-columns:minmax(0,1fr)}[data-oh-story-layout=compact] .oh-story-media-library>header{flex-direction:column;align-items:stretch}[data-oh-story-layout=compact] .oh-story-media-library>header>div:last-child{grid-template-columns:minmax(0,1fr) auto;display:grid}[data-oh-story-layout=compact] .oh-story-media-library input{width:100%}[data-oh-story-layout=compact] .oh-story-sequence{padding-inline:6px}[data-oh-story-layout=compact] .oh-story-sequence-summary{flex-wrap:wrap}[data-oh-story-layout=compact] .oh-story-sequence-summary span{display:none}[data-oh-story-layout=compact] .oh-story-sequence>ol>li{grid-template-columns:24px 64px minmax(0,1fr);gap:5px}[data-oh-story-layout=compact] .oh-story-sequence>ol>li .oh-story-media-preview,[data-oh-story-layout=compact] .oh-story-sequence-missing{width:64px;height:40px}[data-oh-story-layout=compact] .oh-story-sequence>ol>li>div:last-child{grid-column:2/4;justify-content:flex-end}[data-oh-story-layout=compact] .oh-story-canvas-shell>.oh-story-projection-note{max-height:48px;margin:8px;overflow:hidden}[data-oh-story-layout=compact] .oh-story-canvas-controls{flex:none;align-self:flex-end;margin:0 8px 8px;position:static}.oh-story-canvas article .oh-story-canvas-port{width:24px;height:24px;color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1);cursor:crosshair;touch-action:none;z-index:3;border:2px solid;border-radius:50%;padding:0;position:absolute;top:38px}.oh-story-canvas article .oh-story-canvas-port:hover,.oh-story-canvas article .oh-story-canvas-port:focus-visible{outline:3px solid}";
		//#endregion
		//#region lib/types/client/index.js
		const name = "oh-story-ui";
		const inject = [
			"slots",
			"sessions",
			"conversation"
		];
		function applyUpdate(current, update) {
			return typeof update === "function" ? update(current) : update;
		}
		function createWorkbenchStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					buffers: {},
					editorMode: "preview",
					expanded: {},
					selected: void 0,
					workbench: "story",
					productionSection: "shots",
					productionSelectedIds: {},
					productionJobs: {},
					productionSelections: {},
					productionReferences: {},
					productionSequence: {},
					productionCanvas: {},
					productionZoom: {},
					productionIntentCalls: {}
				}),
				actions: {
					setBuffers: (draft, update) => {
						draft.buffers = applyUpdate(draft.buffers, update);
					},
					setEditorMode: (draft, update) => {
						draft.editorMode = applyUpdate(draft.editorMode, update);
					},
					setExpanded: (draft, update) => {
						draft.expanded = applyUpdate(draft.expanded, update);
					},
					setSelected: (draft, update) => {
						draft.selected = applyUpdate(draft.selected, update);
					},
					setWorkbench: (draft, update) => {
						draft.workbench = applyUpdate(draft.workbench, update);
					},
					setProductionSection: (draft, update) => {
						draft.productionSection = applyUpdate(draft.productionSection, update);
					},
					setProductionSelectedIds: (draft, update) => {
						draft.productionSelectedIds = applyUpdate(draft.productionSelectedIds, update);
					},
					setProductionJobs: (draft, update) => {
						draft.productionJobs = applyUpdate(draft.productionJobs, update);
					},
					setProductionSelections: (draft, update) => {
						draft.productionSelections = applyUpdate(draft.productionSelections, update);
					},
					setProductionReferences: (draft, update) => {
						draft.productionReferences = applyUpdate(draft.productionReferences, update);
					},
					setProductionSequence: (draft, update) => {
						draft.productionSequence = applyUpdate(draft.productionSequence, update);
					},
					setProductionCanvas: (draft, update) => {
						draft.productionCanvas = applyUpdate(draft.productionCanvas, update);
					},
					setProductionZoom: (draft, update) => {
						draft.productionZoom = applyUpdate(draft.productionZoom, update);
					},
					setProductionIntentCalls: (draft, update) => {
						draft.productionIntentCalls = applyUpdate(draft.productionIntentCalls, update);
					}
				}
			});
		}
		var WorkspaceRequestError = class extends Error {
			status;
			constructor(status, message) {
				super(message);
				this.status = status;
			}
		};
		const GROUP_ORDER = {
			story: [
				"正文",
				"大纲",
				"设定",
				"追踪",
				"对标",
				"参考资料"
			],
			drama: [
				"项目",
				"输入",
				"项目开发",
				"设定集",
				"剧集",
				"审查",
				"创作者决策",
				"交付"
			]
		};
		const WORKBENCH_MODES = ["story", "drama"];
		const EDITOR_MODES = [
			"preview",
			"source",
			"production"
		];
		function handleTabKey(event, values, current, select) {
			let index;
			if (event.key === "Home") index = 0;
			else if (event.key === "End") index = values.length - 1;
			else if (event.key === "ArrowRight") index = (values.indexOf(current) + 1) % values.length;
			else if (event.key === "ArrowLeft") index = (values.indexOf(current) - 1 + values.length) % values.length;
			if (index === void 0) return;
			event.preventDefault();
			const value = values[index];
			if (value === void 0) return;
			select(value);
			event.currentTarget.parentElement?.querySelectorAll("[role='tab']")[index]?.focus();
		}
		function groupForPath(path) {
			return path === "short-drama.json" ? "项目" : path.split("/", 1)[0] ?? "其他";
		}
		function endpoint(path, sessionId, file) {
			const url = new URL(`/oh-story/${path}`, globalThis.location.origin);
			url.searchParams.set("sessionId", sessionId);
			if (file !== void 0) url.searchParams.set("path", file);
			return url.toString();
		}
		async function json(response) {
			const value = await response.json();
			if (!response.ok) throw new WorkspaceRequestError(response.status, value.error ?? `HTTP ${String(response.status)}`);
			return value;
		}
		function FileTreeNodes({ nodes, depth, expanded, selected, activityPath, onToggle, onSelect }) {
			return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: nodes.map((node) => {
				if (node.kind === "file") return (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: { "--oh-story-indent": `${String(depth * 14)}px` },
					title: node.path,
					"aria-label": node.path,
					"data-file-path": node.path,
					"data-agent-target": node.path === activityPath || void 0,
					"aria-current": node.path === selected ? "page" : void 0,
					onClick: () => {
						onSelect(node.path);
					},
					children: node.name
				}, node.path);
				return (0, react_jsx_runtime.jsxs)("details", {
					className: "oh-story-file-folder",
					open: selected?.startsWith(`${node.path}/`) === true || expanded[node.path] === true,
					onToggle: (event) => {
						onToggle(node.path, event.currentTarget.open);
					},
					children: [(0, react_jsx_runtime.jsxs)("summary", {
						style: { "--oh-story-indent": `${String(depth * 14)}px` },
						title: node.path,
						children: [node.name, (0, react_jsx_runtime.jsx)("span", { children: node.fileCount })]
					}), (0, react_jsx_runtime.jsx)(FileTreeNodes, {
						nodes: node.children,
						depth: depth + 1,
						expanded,
						selected,
						activityPath,
						onToggle,
						onSelect
					})]
				}, node.path);
			}) });
		}
		function useWorkspace(sessionId) {
			const [version, setVersion] = (0, react.useState)(0);
			const [workspace, setWorkspace] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(true);
			const reload = (0, react.useCallback)(() => {
				setLoading(true);
				setVersion((value) => value + 1);
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				setError(void 0);
				fetch(endpoint("workspace", sessionId), { signal: controller.signal }).then((response) => json(response)).then(setWorkspace).catch((reason) => {
					if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
				return () => {
					controller.abort();
				};
			}, [sessionId, version]);
			return {
				workspace,
				error,
				loading,
				reload
			};
		}
		function CreativeWorkbench({ sessionId, runningCalls, partial, settledMutation, sessionRunning, productionQueue, productionIntents, sendProductionPrompt, cancelProduction, removeQueuedProduction, useStore, actions }) {
			const { workspace, error, loading: workspaceLoading, reload } = useWorkspace(sessionId);
			const activities = (0, react.useMemo)(() => fileMutations(runningCalls, partial), [partial, runningCalls]);
			const normalizedActivities = (0, react.useMemo)(() => activities.flatMap((activity) => {
				const path = creativeRelativePath(activity.path, workspace?.cwd);
				return path === void 0 ? [] : [{
					activity,
					path
				}];
			}), [activities, workspace?.cwd]);
			const primaryActivity = normalizedActivities.at(-1);
			const activityPaths = (0, react.useMemo)(() => new Set(normalizedActivities.map((value) => value.path)), [normalizedActivities]);
			const activity = primaryActivity?.activity;
			const activityPath = primaryActivity?.path;
			const workbench = useStore((memory) => memory.workbench);
			const setWorkbench = actions.setWorkbench;
			const initializedWorkbench = (0, react.useRef)(false);
			const storedSelected = useStore((memory) => memory.selected);
			const selected = typeof storedSelected === "string" ? storedSelected : void 0;
			const setSelected = actions.setSelected;
			const buffers = useStore((memory) => memory.buffers);
			const setBuffers = actions.setBuffers;
			const buffersRef = (0, react.useRef)({});
			const expanded = useStore((memory) => memory.expanded);
			const setExpanded = actions.setExpanded;
			const productionSection = useStore((memory) => memory.productionSection);
			const setProductionSection = actions.setProductionSection;
			const productionSelectedIds = useStore((memory) => memory.productionSelectedIds);
			const productionJobsByEpisode = useStore((memory) => memory.productionJobs);
			const productionSelectionsByEpisode = useStore((memory) => memory.productionSelections);
			const productionReferencesByEpisode = useStore((memory) => memory.productionReferences);
			const productionSequenceByEpisode = useStore((memory) => memory.productionSequence);
			const productionCanvasByEpisode = useStore((memory) => memory.productionCanvas);
			const productionZoomByEpisode = useStore((memory) => memory.productionZoom);
			const productionIntentCalls = useStore((memory) => memory.productionIntentCalls);
			const surfaceRef = (0, react.useRef)(null);
			const navRef = (0, react.useRef)(null);
			const activityBases = (0, react.useRef)(/* @__PURE__ */ new Map());
			const previousSignals = (0, react.useRef)(/* @__PURE__ */ new Set());
			const previousSettledMutation = (0, react.useRef)(settledMutation);
			const saveLocks = (0, react.useRef)(/* @__PURE__ */ new Set());
			const buffer = selected === void 0 ? void 0 : buffers[selected];
			const selectedFile = workspace?.files.find((file) => file.path === selected);
			const selectedMedia = selectedFile?.kind === "media";
			const dirty = buffer?.source === "human" && buffer.content !== buffer.saved;
			const saving = buffer?.saving === true;
			const fileError = buffer?.error;
			const conflict = buffer?.conflict;
			const selectedLower = selected?.toLocaleLowerCase();
			const markdown = selectedLower?.endsWith(".md") === true;
			const jsonl = selectedLower?.endsWith(".jsonl") === true;
			const structured = jsonl || selectedLower?.endsWith(".json") === true;
			const previewable = markdown || jsonl;
			const episodeDirectory = episodeDirectoryForPath(selected);
			const productionAvailable = selected !== void 0 && isCreatorDocumentPath(selected) && episodeDirectory !== void 0;
			const editorModes = productionAvailable ? EDITOR_MODES : EDITOR_MODES.filter((mode) => mode !== "production");
			const episodeDocumentPaths = (0, react.useMemo)(() => episodeDirectory === void 0 ? [] : creatorDocumentPaths(workspace?.files.filter((file) => file.kind === "text") ?? [], episodeDirectory), [episodeDirectory, workspace?.files]);
			const episodeDocuments = (0, react.useMemo)(() => Object.fromEntries(episodeDocumentPaths.flatMap((path) => {
				const current = buffers[path];
				return current === void 0 || current.missing === true ? [] : [[path, current.content]];
			})), [buffers, episodeDocumentPaths]);
			const episodeProduction = (0, react.useMemo)(() => episodeDirectory === void 0 ? void 0 : parseEpisodeProduction(episodeDocuments, episodeDirectory), [episodeDirectory, episodeDocuments]);
			const productionLibrary = (0, react.useMemo)(() => (workspace?.files ?? []).flatMap((file) => {
				if (file.kind !== "media" || file.mimeType?.startsWith("audio/") === true) return [];
				if (!file.path.startsWith("剧集/") && !file.path.startsWith("交付/")) return [];
				const targetId = file.path.toLocaleUpperCase().match(/(?:SHOT|IMG|MOTION|VISUAL)-[A-Z0-9-]+/u)?.[0] ?? file.path.split("/").at(-2) ?? "PROJECT-MEDIA";
				return [{
					id: `workspace:${file.path}:${file.version}`,
					targetId,
					kind: file.mimeType?.startsWith("image/") === true ? "image" : "video",
					url: endpoint("media", sessionId, file.path),
					path: file.path
				}];
			}), [sessionId, workspace?.files]);
			const productionVersions = (0, react.useMemo)(() => {
				if (episodeProduction === void 0) return [];
				const episodeName = episodeProduction.episodeDirectory.split("/").at(-1) ?? "";
				const knownTargets = [
					...episodeProduction.shots.map((shot) => shot.id),
					...episodeProduction.assets.map((asset) => asset.id),
					...episodeProduction.visualAssets.map((asset) => asset.id),
					...episodeProduction.motions.map((motion) => motion.id)
				].sort((left, right) => right.length - left.length);
				const motionTargets = new Map(episodeProduction.motions.flatMap((motion) => motion.shotId === void 0 ? [] : [[motion.id, motion.shotId]]));
				const fromWorkspace = productionLibrary.flatMap((version) => {
					if (version.path === void 0 || !version.path.startsWith(`${episodeProduction.episodeDirectory}/`) && !version.path.startsWith(`交付/${episodeName}/`)) return [];
					const matched = mediaTargetFromPath(version.path, knownTargets);
					const composition = /(?:^|\/)成片-[^/]+\.mp4$/iu.test(version.path);
					if (matched === void 0 && !composition) return [];
					const targetId = matched === void 0 ? episodeProduction.episodeDirectory : motionTargets.get(matched) ?? matched;
					return [{
						...version,
						targetId
					}];
				});
				const byId = /* @__PURE__ */ new Map();
				for (const version of fromWorkspace) byId.set(version.id, version);
				return [...byId.values()];
			}, [episodeProduction, productionLibrary]);
			const productionSelectedId = episodeDirectory === void 0 ? void 0 : productionSelectedIds[episodeDirectory];
			const productionJobs = episodeDirectory === void 0 ? [] : productionJobsByEpisode[episodeDirectory] ?? [];
			const productionSelections = episodeDirectory === void 0 ? {} : productionSelectionsByEpisode[episodeDirectory] ?? {};
			const productionReferences = episodeDirectory === void 0 ? {} : productionReferencesByEpisode[episodeDirectory] ?? {};
			const productionSequence = episodeDirectory === void 0 ? [] : productionSequenceByEpisode[episodeDirectory] ?? [];
			const productionCanvas = episodeDirectory === void 0 ? {} : productionCanvasByEpisode[episodeDirectory] ?? {};
			const productionZoom = episodeDirectory === void 0 ? .65 : productionZoomByEpisode[episodeDirectory] ?? .65;
			const setProductionSelectedId = (0, react.useCallback)((selectedId) => {
				if (episodeDirectory !== void 0) actions.setProductionSelectedIds((current) => ({
					...current,
					[episodeDirectory]: selectedId
				}));
			}, [actions, episodeDirectory]);
			const setProductionJobs = (0, react.useCallback)((jobs) => {
				if (episodeDirectory !== void 0) actions.setProductionJobs((current) => ({
					...current,
					[episodeDirectory]: jobs
				}));
			}, [actions, episodeDirectory]);
			const setProductionSelections = (0, react.useCallback)((selections) => {
				if (episodeDirectory !== void 0) actions.setProductionSelections((current) => ({
					...current,
					[episodeDirectory]: selections
				}));
			}, [actions, episodeDirectory]);
			const setProductionReferences = (0, react.useCallback)((references) => {
				if (episodeDirectory !== void 0) actions.setProductionReferences((current) => ({
					...current,
					[episodeDirectory]: references
				}));
			}, [actions, episodeDirectory]);
			const setProductionSequence = (0, react.useCallback)((sequence) => {
				if (episodeDirectory !== void 0) actions.setProductionSequence((current) => ({
					...current,
					[episodeDirectory]: sequence
				}));
			}, [actions, episodeDirectory]);
			const setProductionCanvas = (0, react.useCallback)((canvas) => {
				if (episodeDirectory !== void 0) actions.setProductionCanvas((current) => ({
					...current,
					[episodeDirectory]: canvas
				}));
			}, [actions, episodeDirectory]);
			const setProductionZoom = (0, react.useCallback)((zoom) => {
				if (episodeDirectory !== void 0) actions.setProductionZoom((current) => ({
					...current,
					[episodeDirectory]: zoom
				}));
			}, [actions, episodeDirectory]);
			const editorMode = useStore((memory) => memory.editorMode);
			const setEditorMode = actions.setEditorMode;
			const modeSelection = (0, react.useRef)(selected);
			const textareaRef = (0, react.useRef)(null);
			const editorPositions = (0, react.useRef)(/* @__PURE__ */ new Map());
			const editorReady = buffer !== void 0 && buffer.missing !== true;
			const availableModes = (0, react.useMemo)(() => {
				const value = /* @__PURE__ */ new Set();
				for (const file of workspace?.files ?? []) {
					const mode = workbenchModeForPath(file.path);
					if (mode !== void 0) value.add(mode);
				}
				if (value.size === 0) value.add("story");
				return WORKBENCH_MODES.filter((mode) => value.has(mode));
			}, [workspace?.files]);
			const showModeTabs = workspace !== void 0 && availableModes.length > 1;
			const workspaceKind = workbench;
			(0, react.useEffect)(() => {
				buffersRef.current = buffers;
			}, [buffers]);
			const rememberEditorPosition = (0, react.useCallback)(() => {
				const element = textareaRef.current;
				if (element === null || selected === void 0 || element.getAttribute("aria-label") !== selected) return;
				editorPositions.current.set(selected, {
					scrollTop: element.scrollTop,
					selectionStart: element.selectionStart,
					selectionEnd: element.selectionEnd
				});
			}, [selected]);
			(0, react.useLayoutEffect)(() => {
				if (editorMode !== "source" || selected === void 0 || !editorReady) return;
				const element = textareaRef.current;
				const position = editorPositions.current.get(selected);
				if (element === null || position === void 0) return;
				const end = Math.min(position.selectionEnd, element.value.length);
				element.setSelectionRange(Math.min(position.selectionStart, end), end);
				element.scrollTop = position.scrollTop;
			}, [
				editorMode,
				editorReady,
				selected
			]);
			(0, react.useEffect)(() => {
				const warn = (event) => {
					if (!Object.values(buffersRef.current).some((value) => value.source === "human" && value.content !== value.saved)) return;
					event.preventDefault();
				};
				globalThis.addEventListener("beforeunload", warn);
				return () => {
					globalThis.removeEventListener("beforeunload", warn);
				};
			}, []);
			const expandPath = (0, react.useCallback)((path) => {
				const segments = path.split("/");
				const ancestors = [groupForPath(path)];
				for (let index = 1; index < segments.length - 1; index += 1) ancestors.push(segments.slice(0, index + 1).join("/"));
				setExpanded((current) => {
					const next = { ...current };
					for (const ancestor of ancestors) next[ancestor] = true;
					return next;
				});
			}, []);
			const revealPath = (0, react.useCallback)((path) => {
				rememberEditorPosition();
				setWorkbench(workbenchModeForPath(path) ?? "story");
				setSelected(path);
				expandPath(path);
			}, [expandPath, rememberEditorPosition]);
			(0, react.useEffect)(() => {
				if (workspace === void 0) return;
				const pending = productionIntents.filter(({ callId }) => productionIntentCalls[callId] !== true);
				if (pending.length === 0) return;
				for (const { intent } of pending) {
					if (intent.action === "open_section" || intent.action === "focus_target") {
						const documentPath = [
							"分镜.md",
							"图片提示词.md",
							"视觉设定.md",
							"剧本.md",
							"视频提示词.md"
						].map((name) => `${intent.episode}/${name}`).find((path) => workspace.files.some((file) => file.path === path));
						if (documentPath !== void 0) {
							setWorkbench("drama");
							setSelected(documentPath);
							expandPath(documentPath);
							globalThis.setTimeout(() => {
								setEditorMode("production");
							}, 0);
						}
					}
					if (intent.action === "open_section") setProductionSection(intent.section ?? "shots");
					else if (intent.action === "focus_target") {
						actions.setProductionSelectedIds((current) => ({
							...current,
							[intent.episode]: intent.targetId
						}));
						setProductionSection(intent.section ?? (intent.targetId?.startsWith("SHOT-") === true ? "shots" : "assets"));
					} else if (intent.action === "set_sequence") actions.setProductionSequence((current) => ({
						...current,
						[intent.episode]: (intent.shotIds ?? []).map((shotId) => ({ shotId }))
					}));
					else if (intent.action === "track_job" && intent.jobId !== void 0 && intent.targetId !== void 0 && intent.jobKind !== void 0) {
						const { jobId, targetId, jobKind } = intent;
						actions.setProductionJobs((current) => {
							const jobs = current[intent.episode] ?? [];
							if (jobs.some((job) => job.id === jobId)) return {
								...current,
								[intent.episode]: jobs.map((job) => job.id === jobId ? {
									...job,
									targetId,
									kind: jobKind,
									status: "running",
									progress: Math.max(10, job.progress),
									prompt: intent.prompt ?? job.prompt,
									expectedOutputs: intent.expectedOutputs ?? job.expectedOutputs,
									error: void 0
								} : job)
							};
							return {
								...current,
								[intent.episode]: [...jobs, {
									...createPendingJob({
										id: jobId,
										targetId,
										kind: jobKind,
										prompt: intent.prompt ?? "",
										expectedOutputs: intent.expectedOutputs
									}),
									status: "running",
									progress: 10
								}]
							};
						});
					}
				}
				actions.setProductionIntentCalls((current) => ({
					...current,
					...Object.fromEntries(pending.map(({ callId }) => [callId, true]))
				}));
			}, [
				actions,
				expandPath,
				productionIntentCalls,
				productionIntents,
				setEditorMode,
				setProductionSection,
				setSelected,
				setWorkbench,
				workspace
			]);
			const followAgentPath = (0, react.useCallback)((path) => {
				expandPath(path);
				const current = selected === void 0 ? void 0 : buffersRef.current[selected];
				if (path !== selected && current?.source === "human" && current.content !== current.saved && surfaceRef.current?.ownerDocument.activeElement === textareaRef.current) return;
				revealPath(path);
			}, [
				expandPath,
				revealPath,
				selected
			]);
			(0, react.useEffect)(() => {
				if (workspace === void 0 || initializedWorkbench.current) return;
				if (!availableModes.includes(workbench)) setWorkbench(availableModes[0] ?? "story");
				initializedWorkbench.current = true;
			}, [
				availableModes,
				workbench,
				workspace
			]);
			(0, react.useEffect)(() => {
				if (activityPath !== void 0 && activityPath === selected && !selectedMedia) setEditorMode("source");
			}, [
				activityPath,
				selected,
				selectedMedia
			]);
			(0, react.useEffect)(() => {
				if (modeSelection.current === selected) return;
				modeSelection.current = selected;
				setEditorMode(selected !== void 0 && activityPaths.has(selected) ? "source" : selectedMedia || previewable ? "preview" : "source");
			}, [
				activityPaths,
				previewable,
				selected,
				selectedMedia
			]);
			(0, react.useEffect)(() => {
				if (workspaceLoading) return;
				if (activityPath !== void 0) return;
				if (selected !== void 0 && ((workspace?.files.some((file) => file.path === selected) ?? false) || buffers[selected] !== void 0) && workbenchModeForPath(selected) === workbench) return;
				setSelected(workspace === void 0 ? void 0 : preferredWorkbenchFile(workspace.files, workbench));
			}, [
				activityPath,
				buffers,
				selected,
				workbench,
				workspace,
				workspaceLoading
			]);
			(0, react.useEffect)(() => {
				if (workspace === void 0 || workspaceLoading) return;
				const paths = new Set(workspace.files.map((file) => file.path));
				setBuffers((current) => {
					let changed = false;
					const next = { ...current };
					for (const [path, value] of Object.entries(current)) {
						if (paths.has(path) || activityPaths.has(path)) continue;
						if (value.source === "human" && value.content !== value.saved) {
							if (value.missing !== true) {
								next[path] = {
									...value,
									missing: true,
									error: "文件已从 workspace 移除。本地草稿仍保留，可复制后放弃草稿。"
								};
								changed = true;
							}
						} else {
							delete next[path];
							changed = true;
						}
					}
					return changed ? next : current;
				});
			}, [
				activityPaths,
				workspace,
				workspaceLoading
			]);
			(0, react.useEffect)(() => {
				if (selected === void 0 || selectedMedia || activityPaths.has(selected)) return;
				if (!(workspace?.files.some((file) => file.path === selected) ?? false)) return;
				const controller = new AbortController();
				setBuffers((current) => {
					const existing = current[selected];
					return existing === void 0 ? current : {
						...current,
						[selected]: {
							...existing,
							error: void 0
						}
					};
				});
				fetch(endpoint("file", sessionId, selected), { signal: controller.signal }).then((response) => json(response)).then((file) => {
					setBuffers((current) => {
						const existing = current[file.path];
						if (existing?.source === "human" && existing.content !== existing.saved) {
							if (existing.version === file.version) return {
								...current,
								[file.path]: {
									...existing,
									missing: false,
									error: void 0
								}
							};
							return {
								...current,
								[file.path]: {
									...existing,
									missing: false,
									error: void 0,
									conflict: {
										message: `${file.path} 已在磁盘上更新；你的本地草稿没有被覆盖。`,
										theirs: file.content,
										theirsVersion: file.version
									}
								}
							};
						}
						return {
							...current,
							[file.path]: {
								content: file.content,
								saved: file.content,
								source: "disk",
								version: file.version
							}
						};
					});
				}).catch((reason) => {
					if (controller.signal.aborted) return;
					setBuffers((current) => {
						const existing = current[selected];
						return existing === void 0 ? current : {
							...current,
							[selected]: {
								...existing,
								error: reason instanceof Error ? reason.message : String(reason)
							}
						};
					});
				});
				return () => {
					controller.abort();
				};
			}, [
				activityPaths,
				selected,
				selectedMedia,
				sessionId,
				workspace?.files
			]);
			(0, react.useEffect)(() => {
				if (!productionAvailable) return;
				const missing = episodeDocumentPaths.filter((path) => buffersRef.current[path] === void 0 && !activityPaths.has(path));
				if (missing.length === 0) return;
				const controller = new AbortController();
				Promise.all(missing.map((path) => fetch(endpoint("file", sessionId, path), { signal: controller.signal }).then((response) => json(response)))).then((files) => {
					setBuffers((current) => {
						const next = { ...current };
						for (const file of files) {
							const existing = next[file.path];
							if (existing?.source === "human" && existing.content !== existing.saved) continue;
							next[file.path] = {
								content: file.content,
								saved: file.content,
								source: "disk",
								version: file.version
							};
						}
						return next;
					});
				}).catch((reason) => {
					if (!controller.signal.aborted) setBuffers((current) => {
						const next = { ...current };
						for (const path of missing) {
							const existing = next[path];
							if (existing !== void 0) next[path] = {
								...existing,
								error: reason instanceof Error ? reason.message : String(reason)
							};
						}
						return next;
					});
				});
				return () => {
					controller.abort();
				};
			}, [
				activityPaths,
				episodeDocumentPaths,
				productionAvailable,
				sessionId
			]);
			(0, react.useEffect)(() => {
				if (normalizedActivities.length === 0) return;
				for (const { path } of normalizedActivities) expandPath(path);
				if (activityPath !== void 0) followAgentPath(activityPath);
				setBuffers((current) => {
					let next = current;
					for (const { activity: currentActivity, path } of normalizedActivities) {
						const existing = next[path];
						if (existing?.source === "human" && existing.content !== existing.saved) {
							next = {
								...next,
								[path]: {
									...existing,
									conflict: { message: `${path} 正由 Agent 修改；你的本地草稿已锁定，不会被覆盖。` }
								}
							};
							continue;
						}
						let basis = activityBases.current.get(currentActivity.callId);
						if (basis === void 0 || basis.path !== path) {
							basis = {
								path,
								base: existing?.content ?? ""
							};
							activityBases.current.set(currentActivity.callId, basis);
						}
						const preview = previewMutation(currentActivity, basis.base);
						if (preview === void 0 || existing?.source === "agent" && existing.content === preview) continue;
						next = {
							...next,
							[path]: {
								content: preview,
								saved: existing?.saved ?? "",
								source: "agent",
								version: existing?.version ?? ""
							}
						};
					}
					return next;
				});
			}, [
				activityPath,
				expandPath,
				followAgentPath,
				normalizedActivities
			]);
			(0, react.useEffect)(() => {
				const signals = new Set(mutatingCallIds(runningCalls));
				for (const { activity: currentActivity } of normalizedActivities) signals.add(currentActivity.callId.split(":", 1)[0] ?? currentActivity.callId);
				const settled = [...previousSignals.current].some((callId) => !signals.has(callId));
				for (const callId of activityBases.current.keys()) if (!signals.has(callId.split(":", 1)[0] ?? callId)) activityBases.current.delete(callId);
				previousSignals.current = signals;
				if (!settled) return;
				reload();
			}, [
				normalizedActivities,
				reload,
				runningCalls
			]);
			(0, react.useEffect)(() => {
				if (settledMutation === void 0 || settledMutation === previousSettledMutation.current) return;
				if (workspace?.cwd === void 0) return;
				previousSettledMutation.current = settledMutation;
				const path = creativeRelativePath(settledMutation.slice(settledMutation.indexOf("\0") + 1), workspace.cwd);
				if (path !== void 0) followAgentPath(path);
				reload();
			}, [
				followAgentPath,
				reload,
				settledMutation,
				workspace?.cwd
			]);
			(0, react.useEffect)(() => {
				if (selected === void 0) return;
				for (const button of navRef.current?.querySelectorAll("button[data-file-path]") ?? []) if (button.dataset.filePath === selected) {
					button.scrollIntoView({ block: "nearest" });
					break;
				}
			}, [selected]);
			(0, react.useEffect)(() => {
				if (normalizedActivities.length > 0 || workspace === void 0) return;
				const sessionSurface = surfaceRef.current?.parentElement;
				if (sessionSurface === void 0 || sessionSurface === null) return;
				const knownPaths = new Set(workspace.files.map((file) => file.path));
				const followOfficialFileLink = (event) => {
					const origin = event.target;
					if (!(origin instanceof Element)) return;
					const control = origin.closest("button, a");
					if (control === null || control.closest(".oh-story-split-surface") !== null) return;
					const candidates = [
						control.title,
						control.getAttribute("aria-label"),
						control.textContent
					];
					for (const candidate of candidates) {
						const path = creativeRelativePath(candidate?.trim().replace(/^(?:Open|打开)\s+/u, ""), workspace.cwd);
						if (path === void 0 || !knownPaths.has(path)) continue;
						event.preventDefault();
						event.stopPropagation();
						revealPath(path);
						break;
					}
				};
				sessionSurface.addEventListener("click", followOfficialFileLink, true);
				return () => {
					sessionSurface.removeEventListener("click", followOfficialFileLink, true);
				};
			}, [
				normalizedActivities.length,
				revealPath,
				workspace
			]);
			const savePath = (0, react.useCallback)(async (path) => {
				if (saveLocks.current.has(path)) return;
				const submitted = buffersRef.current[path];
				if (submitted === void 0 || submitted.missing === true || submitted.content === submitted.saved) return;
				saveLocks.current.add(path);
				setBuffers((current) => {
					const existing = current[path];
					return existing === void 0 ? current : {
						...current,
						[path]: {
							...existing,
							saving: true,
							error: void 0
						}
					};
				});
				try {
					const file = await json(await fetch(endpoint("file", sessionId, path), {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							content: submitted.content,
							baseVersion: submitted.version
						})
					}));
					setBuffers((current) => {
						const latest = current[path];
						if (latest === void 0) return current;
						const unchanged = latest.content === submitted.content;
						return {
							...current,
							[path]: {
								content: unchanged ? file.content : latest.content,
								saved: file.content,
								source: unchanged ? "disk" : "human",
								version: file.version,
								saving: false
							}
						};
					});
					reload();
				} catch (reason) {
					if (reason instanceof WorkspaceRequestError && reason.status === 412) try {
						const theirs = await json(await fetch(endpoint("file", sessionId, path)));
						setBuffers((current) => {
							const latest = current[path];
							if (latest === void 0) return current;
							return {
								...current,
								[path]: {
									...latest,
									saving: false,
									conflict: {
										message: `${path} 已在磁盘上更新；请选择保留哪一版。`,
										theirs: theirs.content,
										theirsVersion: theirs.version
									}
								}
							};
						});
					} catch (refreshError) {
						setBuffers((current) => {
							const existing = current[path];
							return existing === void 0 ? current : {
								...current,
								[path]: {
									...existing,
									saving: false,
									error: refreshError instanceof Error ? refreshError.message : String(refreshError)
								}
							};
						});
					}
					else setBuffers((current) => {
						const existing = current[path];
						return existing === void 0 ? current : {
							...current,
							[path]: {
								...existing,
								saving: false,
								error: reason instanceof Error ? reason.message : String(reason)
							}
						};
					});
				} finally {
					saveLocks.current.delete(path);
				}
			}, [reload, sessionId]);
			(0, react.useEffect)(() => {
				const saveShortcut = (event) => {
					if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "s") return;
					event.preventDefault();
					if (selected !== void 0) savePath(selected);
				};
				globalThis.addEventListener("keydown", saveShortcut);
				return () => {
					globalThis.removeEventListener("keydown", saveShortcut);
				};
			}, [savePath, selected]);
			const groups = (0, react.useMemo)(() => {
				const value = /* @__PURE__ */ new Map();
				const all = [...workspace?.files ?? []].filter((file) => workbenchModeForPath(file.path) === workbench);
				if (activityPath !== void 0 && !all.some((file) => file.path === activityPath)) all.push({
					path: activityPath,
					bytes: 0,
					version: "",
					kind: "text"
				});
				all.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
				for (const file of all) {
					const directory = groupForPath(file.path);
					const files = value.get(directory) ?? [];
					files.push(file);
					value.set(directory, files);
				}
				const order = GROUP_ORDER[workbench];
				return [...value.entries()].sort(([left], [right]) => {
					const leftIndex = order.indexOf(left);
					const rightIndex = order.indexOf(right);
					return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex) || left.localeCompare(right, "zh-Hans-CN");
				});
			}, [
				activityPath,
				workbench,
				workspace
			]);
			const selectWorkbench = (next) => {
				setWorkbench(next);
				const target = workspace === void 0 ? void 0 : preferredWorkbenchFile(workspace.files, next);
				if (target === void 0) setSelected(void 0);
				else revealPath(target);
			};
			const selectEditorMode = (next) => {
				if (next === "preview") rememberEditorPosition();
				setEditorMode(next);
			};
			const navigateProductionTarget = (target) => {
				const before = (buffersRef.current[target.path]?.content ?? "").slice(0, target.offset);
				const approximateScrollTop = Math.max(0, before.split(/\r?\n/u).length * 28 - 96);
				editorPositions.current.set(target.path, {
					scrollTop: approximateScrollTop,
					selectionStart: target.offset,
					selectionEnd: target.offset
				});
				modeSelection.current = target.path;
				revealPath(target.path);
				setEditorMode("source");
			};
			const selectedLabel = selected ?? `在当前 DSH workspace 中选择${workbench === "story" ? "小说" : "短剧"}文件`;
			const selectedBasename = selected?.split("/").at(-1) ?? selectedLabel;
			const selectedGroup = selected === void 0 ? void 0 : groupForPath(selected);
			console.info("[oh-story-debug]", JSON.stringify({
				storedSelected,
				selected,
				workbench,
				editorMode,
				workspace: workspace === void 0 ? "missing" : {
					files: workspace.files.length,
					metadataErrors: workspace.metadataErrors
				}
			}));
			const toggleGroup = (key, open) => {
				setExpanded((current) => ({
					...current,
					[key]: open
				}));
			};
			const resolveConflict = (keepLocal) => {
				if (selected === void 0 || conflict?.theirs === void 0 || conflict.theirsVersion === void 0) return;
				const theirs = conflict.theirs;
				const theirsVersion = conflict.theirsVersion;
				setBuffers((current) => {
					const existing = current[selected];
					if (existing === void 0) return current;
					return {
						...current,
						[selected]: keepLocal ? {
							...existing,
							saved: theirs,
							version: theirsVersion,
							source: "human",
							conflict: void 0
						} : {
							content: theirs,
							saved: theirs,
							source: "disk",
							version: theirsVersion
						}
					};
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: surfaceRef,
				className: "oh-story-split-surface",
				"data-workbench": workbench,
				children: [(0, react_jsx_runtime.jsx)("style", { children: plugin_css_default }), (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("aside", {
					className: "oh-story-tree",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-brand",
							children: [(0, react_jsx_runtime.jsxs)("span", {
								className: "oh-story-brand-cluster",
								children: [(0, react_jsx_runtime.jsxs)("strong", { children: ["✦ ", (0, react_jsx_runtime.jsx)("span", { children: "Oh Story" })] }), workspaceKind !== void 0 && (0, react_jsx_runtime.jsx)("span", {
									className: "oh-story-kind",
									children: workspaceKind === "story" ? "小说" : "短剧"
								})]
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: reload,
								title: "刷新",
								"aria-label": "刷新项目文件",
								children: "↻"
							})]
						}),
						showModeTabs && (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-mode-tabs",
							role: "tablist",
							"aria-label": "创作工作台",
							children: availableModes.map((mode) => (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								tabIndex: workbench === mode ? 0 : -1,
								"aria-selected": workbench === mode,
								onKeyDown: (event) => {
									handleTabKey(event, availableModes, workbench, selectWorkbench);
								},
								onClick: () => {
									selectWorkbench(mode);
								},
								children: mode === "story" ? "小说" : mode === "drama" ? "短剧" : "游戏"
							}, mode))
						}),
						error !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-error",
							children: error
						}),
						workspace?.metadataErrors.map((message) => (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-warning",
							children: message
						}, message)),
						(0, react_jsx_runtime.jsx)("nav", {
							ref: navRef,
							"aria-label": workbench === "story" ? "小说项目文件" : "短剧项目文件",
							children: groups.map(([directory, files]) => {
								return (0, react_jsx_runtime.jsxs)("details", {
									className: "oh-story-file-group",
									open: selectedGroup === directory || expanded[directory] === true,
									onToggle: (event) => {
										toggleGroup(directory, event.currentTarget.open);
									},
									children: [(0, react_jsx_runtime.jsxs)("summary", { children: [directory, (0, react_jsx_runtime.jsx)("span", { children: files.length })] }), (0, react_jsx_runtime.jsx)(FileTreeNodes, {
										nodes: buildFileTree(files, directory),
										depth: 1,
										expanded,
										selected,
										activityPath,
										onToggle: toggleGroup,
										onSelect: revealPath
									})]
								}, directory);
							})
						})
					]
				}), (0, react_jsx_runtime.jsxs)("main", {
					className: "oh-story-editor",
					children: [
						(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsxs)("span", {
							className: "oh-story-editor-path",
							title: selected,
							children: [(0, react_jsx_runtime.jsx)("span", { children: selectedLabel }), (0, react_jsx_runtime.jsx)("strong", { children: selectedBasename })]
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-editor-actions",
							children: [(previewable || productionAvailable) && !selectedMedia && (0, react_jsx_runtime.jsx)("div", {
								className: "oh-story-editor-tabs",
								role: "tablist",
								"aria-label": productionAvailable ? "短剧文档查看方式" : markdown ? "Markdown 查看方式" : "JSONL 查看方式",
								children: editorModes.map((mode) => (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									role: "tab",
									tabIndex: editorMode === mode ? 0 : -1,
									"aria-selected": editorMode === mode,
									onKeyDown: (event) => {
										handleTabKey(event, editorModes, editorMode, selectEditorMode);
									},
									onClick: () => {
										selectEditorMode(mode);
									},
									children: mode === "preview" ? "预览" : mode === "source" ? "源码" : "生产"
								}, mode))
							}), (dirty || saving) && selected !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								className: "oh-story-save",
								type: "button",
								disabled: saving || buffer?.missing === true,
								onClick: () => {
									savePath(selected);
								},
								children: saving ? "保存中…" : "保存"
							})]
						})] }),
						activity !== void 0 && activityPath !== void 0 && activityPath === selected && (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-stream",
							"data-stage": activity.stage,
							role: "status",
							"aria-live": "polite",
							children: ["● ", activity.stage === "running" ? "Agent 正在应用修改" : "Agent 正在生成文件内容"]
						}),
						conflict !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-conflict",
							role: "alert",
							children: [(0, react_jsx_runtime.jsx)("span", { children: conflict.message }), conflict.theirs !== void 0 && conflict.theirsVersion !== void 0 && selected !== void 0 && (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									resolveConflict(false);
								},
								children: "载入磁盘版本"
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									resolveConflict(true);
								},
								children: "保留本地草稿"
							})] })]
						}),
						fileError !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-error",
							children: fileError
						}),
						selected === void 0 ? (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-empty",
							children: workbench === "story" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								"当前 workspace 还没有小说文件。可在右侧 Chat 中运行 ",
								(0, react_jsx_runtime.jsx)("code", { children: "/story-setup" }),
								"。"
							] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								"当前 workspace 还没有短剧项目。可在右侧 Chat 中运行 ",
								(0, react_jsx_runtime.jsx)("code", { children: "/short-drama" }),
								"。"
							] })
						}) : selectedMedia && selectedFile !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
							className: "oh-story-media-document",
							children: selectedFile.mimeType?.startsWith("image/") === true ? (0, react_jsx_runtime.jsx)("img", {
								src: endpoint("media", sessionId, selectedFile.path),
								alt: selectedFile.path
							}) : selectedFile.mimeType?.startsWith("audio/") === true ? (0, react_jsx_runtime.jsx)("audio", {
								src: endpoint("media", sessionId, selectedFile.path),
								controls: true
							}) : (0, react_jsx_runtime.jsx)("video", {
								src: endpoint("media", sessionId, selectedFile.path),
								controls: true,
								preload: "metadata"
							})
						}) : buffer === void 0 ? (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-empty",
							children: [
								"正在加载 ",
								selected,
								"…"
							]
						}) : buffer.missing === true ? (0, react_jsx_runtime.jsxs)("div", {
							className: "oh-story-empty",
							children: ["文件已从 workspace 移除，本地草稿仍保留。请先复制需要的内容，再放弃草稿。", (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									setBuffers((current) => {
										const next = { ...current };
										delete next[selected];
										return next;
									});
									setSelected(workspace === void 0 ? void 0 : preferredWorkbenchFile(workspace.files, workbench));
								},
								children: "放弃本地草稿"
							})]
						}) : editorMode === "production" && productionAvailable && episodeProduction !== void 0 ? (0, react_jsx_runtime.jsx)(CanvasDocument, {
							sessionId,
							production: episodeProduction,
							sessionRunning,
							queue: productionQueue,
							section: productionSection,
							selectedId: productionSelectedId,
							jobs: productionJobs,
							versions: productionVersions,
							libraryVersions: productionLibrary,
							selections: productionSelections,
							manualReferences: productionReferences,
							sequence: productionSequence,
							canvas: productionCanvas,
							zoom: productionZoom,
							onSectionChange: setProductionSection,
							onSelect: setProductionSelectedId,
							onNavigate: navigateProductionTarget,
							onJobsChange: setProductionJobs,
							onSelectionsChange: setProductionSelections,
							onManualReferencesChange: setProductionReferences,
							onOpenMedia: (path) => {
								revealPath(path);
							},
							onSequenceChange: setProductionSequence,
							onCanvasChange: setProductionCanvas,
							onZoomChange: setProductionZoom,
							onDispatchPrompt: sendProductionPrompt,
							onCancelTurn: cancelProduction,
							onRemoveQueued: removeQueuedProduction,
							onRefresh: reload
						}, `${sessionId}:${episodeProduction.episodeDirectory}`) : previewable && editorMode === "preview" ? markdown ? (0, react_jsx_runtime.jsx)(MarkdownPreview, {
							content: buffer.content,
							label: selected
						}) : (0, react_jsx_runtime.jsx)(JsonlPreview, {
							content: buffer.content,
							label: selected
						}) : (0, react_jsx_runtime.jsx)("textarea", {
							ref: textareaRef,
							value: buffer.content,
							"data-format": structured ? "structured" : "prose",
							onBlur: rememberEditorPosition,
							onScroll: rememberEditorPosition,
							onSelect: rememberEditorPosition,
							onChange: (event) => {
								const content = event.target.value;
								setBuffers((current) => ({
									...current,
									[selected]: {
										content,
										saved: current[selected]?.saved ?? "",
										source: "human",
										version: current[selected]?.version ?? "",
										conflict: current[selected]?.conflict,
										saving: current[selected]?.saving
									}
								}));
							},
							spellCheck: !structured,
							"aria-label": selected
						})
					]
				})] })]
			});
		}
		/** Mount beside the official conversation without replacing Chat or Composer. */
		function CreativeSplitBridge({ sessionId, useSession, useChat, useStore, actions, sendProductionPrompt, cancelProduction, removeQueuedProduction }) {
			const marker = (0, react.useRef)(null);
			const [target, setTarget] = (0, react.useState)();
			const runningCalls = useChat((snapshot) => snapshot.legacy.runningCalls);
			const partial = useChat((snapshot) => streamingAssistant(snapshot.timeline));
			const settledMutation = useChat(latestSettledMutation);
			const workbench = useStore((memory) => memory.workbench);
			const sessionRunning = useSession((snapshot) => snapshot.running);
			const productionQueue = useSession((snapshot) => snapshot.queue.map((item) => ({
				id: item.id,
				preview: item.preview
			})));
			const chat = useChat((snapshot) => snapshot);
			const productionIntents = (0, react.useMemo)(() => settledProductionIntents(chat), [chat]);
			(0, react.useLayoutEffect)(() => {
				const document = marker.current?.ownerDocument;
				if (document === void 0) return;
				const locate = () => {
					const anchor = document.querySelector("[data-conversation-scroll] > [data-slot='conversation.session']");
					setTarget((current) => current === anchor ? current : anchor ?? void 0);
				};
				locate();
				const observer = new MutationObserver(locate);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
				};
			}, [sessionId]);
			(0, react.useLayoutEffect)(() => {
				const scroller = target?.parentElement;
				if (scroller === void 0 || scroller === null) return;
				const publishLayout = () => {
					scroller.style.setProperty("--oh-story-scroll-height", `${String(scroller.clientHeight)}px`);
					scroller.dataset.ohStoryWorkbench = workbench;
					const layout = scroller.clientWidth < 620 ? "compact" : scroller.clientWidth < 900 ? "medium" : "wide";
					if (scroller.dataset.ohStoryLayout !== layout) scroller.dataset.ohStoryLayout = layout;
				};
				publishLayout();
				const observer = new ResizeObserver(publishLayout);
				observer.observe(scroller);
				return () => {
					observer.disconnect();
					scroller.style.removeProperty("--oh-story-scroll-height");
					delete scroller.dataset.ohStoryLayout;
					delete scroller.dataset.ohStoryWorkbench;
				};
			}, [target, workbench]);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
				ref: marker,
				className: "oh-story-bridge-marker",
				"aria-hidden": true
			}), target === void 0 ? null : (0, react_dom.createPortal)((0, react_jsx_runtime.jsx)(CreativeWorkbench, {
				sessionId,
				runningCalls,
				partial,
				settledMutation,
				sessionRunning,
				productionQueue,
				productionIntents,
				sendProductionPrompt,
				cancelProduction,
				removeQueuedProduction,
				useStore,
				actions
			}), target)] });
		}
		function WorkbenchSeat({ SessionProvider, renderSlot }) {
			return (0, react_jsx_runtime.jsx)(SessionProvider, { children: renderSlot("oh-story.workspace", {}) });
		}
		function argsOf(block) {
			const raw = ("kind" in block ? block.call?.argsRaw : block.argsRaw) ?? "{}";
			try {
				const value = JSON.parse(raw);
				return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
			} catch {
				return {};
			}
		}
		function resultOf(block) {
			if (!("kind" in block)) return void 0;
			return block.content.map((item) => item.type === "text" ? item.text : JSON.stringify(item, null, 2)).join("\n");
		}
		function RoleToolView({ block, inspect }) {
			const args = argsOf(block);
			const role = typeof args.role === "string" ? args.role : "story-role";
			const output = resultOf(block);
			const state = !("kind" in block) ? "running" : block.isError ? "error" : "done";
			return (0, react_jsx_runtime.jsxs)("details", {
				className: "oh-story-role",
				"data-state": state,
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: plugin_css_default }),
					(0, react_jsx_runtime.jsxs)("summary", { children: [
						(0, react_jsx_runtime.jsx)("span", { children: "✦ Role" }),
						(0, react_jsx_runtime.jsx)("strong", { children: role }),
						(0, react_jsx_runtime.jsx)("em", { children: state === "running" ? "运行中" : state === "error" ? "失败" : "完成" })
					] }),
					output !== void 0 && (0, react_jsx_runtime.jsx)("pre", { children: output }),
					inspect !== void 0 && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: inspect,
						children: "在轨迹中检查"
					})
				]
			});
		}
		function ProductionToolView({ block, inspect }) {
			const args = argsOf(block);
			const action = typeof args.action === "string" ? args.action : "production";
			const episode = typeof args.episode === "string" ? args.episode : "短剧";
			const state = !("kind" in block) ? "running" : block.isError ? "error" : "done";
			return (0, react_jsx_runtime.jsxs)("details", {
				className: "oh-story-role",
				"data-state": state,
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: plugin_css_default }),
					(0, react_jsx_runtime.jsxs)("summary", { children: [
						(0, react_jsx_runtime.jsx)("span", { children: "▦ 生产" }),
						(0, react_jsx_runtime.jsxs)("strong", { children: [
							episode,
							" · ",
							action
						] }),
						(0, react_jsx_runtime.jsx)("em", { children: state === "running" ? "执行中" : state === "error" ? "失败" : "已应用" })
					] }),
					resultOf(block) !== void 0 && (0, react_jsx_runtime.jsx)("pre", { children: resultOf(block) }),
					inspect !== void 0 && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: inspect,
						children: "在轨迹中检查"
					})
				]
			});
		}
		/** Register only official DSH surfaces; the split bridge never replaces Chat. */
		function apply(context) {
			const slots = context.get("slots");
			if (slots === void 0) throw new Error("oh-story: slots service unavailable");
			slots.inject("shell.overlay", () => {
				return [slots.register({
					name: "shell.overlay",
					id: "oh-story-workspace",
					order: -100,
					children: { "oh-story.workspace": {
						kind: "single",
						scope: "session"
					} }
				}, WorkbenchSeat), slots.register({
					name: "oh-story.workspace",
					store: createWorkbenchStore,
					inject: (sessionId) => {
						const session = context.get("sessions")?.scope(sessionId);
						const conversation = session?.get("conversation");
						if (session === void 0 || conversation === void 0) return {
							sendProductionPrompt: () => Promise.reject(/* @__PURE__ */ new Error("DSH 会话当前不可用。")),
							cancelProduction: () => Promise.reject(/* @__PURE__ */ new Error("DSH 会话当前不可用。")),
							removeQueuedProduction: () => Promise.reject(/* @__PURE__ */ new Error("DSH 会话当前不可用。"))
						};
						return {
							sendProductionPrompt: (prompt) => conversation.send(prompt),
							cancelProduction: () => conversation.cancel(),
							removeQueuedProduction: (itemId) => conversation.updateQueue(itemId, { kind: "remove" })
						};
					}
				}, CreativeSplitBridge)];
			});
			slots.inject("tool.call.toolview", () => slots.register({
				name: "tool.call.toolview",
				key: "oh_story_role"
			}, RoleToolView));
			slots.inject("tool.call.toolview", () => slots.register({
				name: "tool.call.toolview",
				key: OH_STORY_PRODUCTION_TOOL_NAME
			}, ProductionToolView));
		}
		var client_default = {
			name,
			inject,
			apply
		};
		//#endregion
		exports.apply = apply;
		exports.default = client_default;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map