const STORY_DIRECTORIES = new Set(['正文', '大纲', '设定', '追踪', '对标', '参考资料']);
const DRAMA_DIRECTORIES = new Set(['输入', '项目开发', '设定集', '剧集', '交付', '创作者决策', '审查']);
const EDITABLE_EXTENSION = /\.(?:md|txt|json|jsonl|html|css|[cm]?js|tsx?|jsx)$/iu;
const MUTATING_CALLS = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'run_code', 'oh_story_role']);
/** Read the latest running Assistant step, including tool-only steps hidden from the Chat list. */
export function streamingAssistant(timeline) {
    for (const turnNumber of timeline.turnOrder.toReversed()) {
        const turn = timeline.turns.get(turnNumber);
        if (turn === undefined)
            continue;
        for (const step of turn.steps.toReversed()) {
            const assistant = step.data.get('assistant-step');
            if (assistant?.status === 'running')
                return assistant;
        }
    }
    return null;
}
function decodeEscape(character) {
    switch (character) {
        case '"': return '"';
        case '\\': return '\\';
        case '/': return '/';
        case 'b': return '\b';
        case 'f': return '\f';
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        default: return undefined;
    }
}
/** Read a JSON string even while the model is still streaming its closing quote. */
export function jsonStringPrefix(raw, key) {
    const match = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}"\\s*:\\s*"`, 'u').exec(raw);
    if (match === null)
        return undefined;
    let value = '';
    for (let index = match.index + match[0].length; index < raw.length; index += 1) {
        const character = raw[index] ?? '';
        if (character === '"')
            return { value, complete: true };
        if (character !== '\\') {
            value += character;
            continue;
        }
        const escape = raw[index + 1];
        if (escape === undefined)
            return { value, complete: false };
        if (escape === 'u') {
            const hex = raw.slice(index + 2, index + 6);
            if (!/^[\da-f]{4}$/iu.test(hex))
                return { value, complete: false };
            value += String.fromCharCode(Number.parseInt(hex, 16));
            index += 5;
            continue;
        }
        const decoded = decodeEscape(escape);
        if (decoded === undefined)
            return { value, complete: false };
        value += decoded;
        index += 1;
    }
    return { value, complete: false };
}
function completedString(raw, key) {
    const value = jsonStringPrefix(raw, key);
    return value?.complete === true ? value.value : undefined;
}
function parsedArgs(raw) {
    try {
        const value = JSON.parse(raw);
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
function mutationFromArgs(name, callId, argsRaw, stage) {
    const complete = parsedArgs(argsRaw);
    if (name === 'write') {
        return {
            callId, name, argsRaw, stage,
            path: jsonStringPrefix(argsRaw, 'file_path')?.value,
            operation: 'replace-file',
            oldText: undefined,
            newText: jsonStringPrefix(argsRaw, 'content')?.value,
            replaceAll: false,
        };
    }
    if (name === 'edit') {
        return {
            callId, name, argsRaw, stage,
            path: jsonStringPrefix(argsRaw, 'file_path')?.value,
            operation: 'replace-text',
            oldText: completedString(argsRaw, 'old_string'),
            newText: jsonStringPrefix(argsRaw, 'new_string')?.value,
            replaceAll: complete?.replace_all === true,
        };
    }
    if (name !== 'str_replace_editor')
        return undefined;
    const command = completedString(argsRaw, 'command');
    if (command === 'view')
        return undefined;
    const path = jsonStringPrefix(argsRaw, 'path')?.value;
    if (command === 'create') {
        return {
            callId, name, argsRaw, stage, path,
            operation: 'replace-file',
            oldText: undefined,
            newText: jsonStringPrefix(argsRaw, 'file_text')?.value,
            replaceAll: false,
        };
    }
    if (command === 'str_replace') {
        return {
            callId, name, argsRaw, stage, path,
            operation: 'replace-text',
            oldText: completedString(argsRaw, 'old_str'),
            newText: jsonStringPrefix(argsRaw, 'new_str')?.value ?? (complete !== undefined ? '' : undefined),
            replaceAll: complete?.replace_all === true,
        };
    }
    if (command === 'insert') {
        return {
            callId, name, argsRaw, stage, path,
            operation: 'insert-text',
            oldText: undefined,
            newText: jsonStringPrefix(argsRaw, 'new_str')?.value,
            replaceAll: false,
        };
    }
    return { callId, name, argsRaw, stage, path, operation: undefined, oldText: undefined, newText: undefined, replaceAll: false };
}
function mutationsFromRunning(call) {
    const direct = mutationFromArgs(call.name, call.callId, call.argsRaw, 'running');
    return direct === undefined ? [] : [direct];
}
function visitRunning(blocks, visit) {
    for (const block of blocks) {
        if (!('kind' in block))
            visit(block);
        visitRunning(block.subCalls, visit);
    }
}
/** Return every active file mutation in official DSH dispatch order, including nested Code Mode calls. */
export function fileMutations(runningCalls, partial = null) {
    const values = [];
    visitRunning(runningCalls, (call) => { values.push(...mutationsFromRunning(call)); });
    for (const block of partial?.blocks ?? []) {
        if (block.kind !== 'tool-call')
            continue;
        const value = mutationFromArgs(block.name, block.callId, block.argsRaw, 'streaming');
        if (value !== undefined && !values.some(candidate => candidate.callId === value.callId))
            values.push(value);
    }
    return values;
}
/** Running calls whose settlement may have changed creative files. */
export function mutatingCallIds(runningCalls) {
    const ids = new Set();
    visitRunning(runningCalls, (call) => { if (MUTATING_CALLS.has(call.name))
        ids.add(call.callId); });
    return ids;
}
function settledMutationSignals(block) {
    const nested = block.subCalls.flatMap(settledMutationSignals);
    if (!('kind' in block) || block.isError)
        return nested;
    const rawDiffs = typeof block.meta === 'object' && block.meta !== null && !Array.isArray(block.meta)
        ? block.meta.diffs
        : undefined;
    const diffs = Array.isArray(rawDiffs) ? rawDiffs.filter((value) => typeof value === 'object' && value !== null
        && typeof value.path === 'string'
        && (typeof value.oldText === 'string' || value.oldText === null)
        && typeof value.newText === 'string') : undefined;
    if (diffs !== undefined)
        return [
            ...diffs.map((diff, index) => `${block.callId}:${String(index)}\0${diff.path}`),
            ...nested,
        ];
    if (block.call === null)
        return nested;
    const mutation = mutationFromArgs(block.call.name, block.callId, block.call.argsRaw, 'running');
    return mutation?.path === undefined ? nested : [`${block.callId}\0${mutation.path}`, ...nested];
}
/** Latest durable successful mutation, used when a fast call skips the live render window. */
export function latestSettledMutation(chat) {
    for (const key of chat.order.toReversed()) {
        const node = chat.nodes.get(key);
        if (node?.kind !== 'tool-call')
            continue;
        const root = node.data.root;
        const signal = root === undefined ? undefined : settledMutationSignals(root).at(-1);
        if (signal !== undefined)
            return signal;
    }
    return undefined;
}
/** Convert a DSH tool path to the creative-relative path accepted by the narrow route. */
export function creativeRelativePath(path, cwd) {
    if (path === undefined || path === '')
        return undefined;
    const normalized = path.replaceAll('\\', '/');
    const root = cwd?.replaceAll('\\', '/').replace(/\/$/u, '');
    const insideRoot = root !== undefined && normalized.startsWith(`${root}/`);
    if ((normalized.startsWith('/') || /^[a-z]:\//iu.test(normalized) || normalized.startsWith('file:')) && !insideRoot)
        return undefined;
    const relative = insideRoot ? normalized.slice(root.length + 1) : normalized.replace(/^\.\//u, '');
    const [directory] = relative.split('/', 1);
    const creative = directory !== undefined && (STORY_DIRECTORIES.has(directory) || DRAMA_DIRECTORIES.has(directory));
    if ((!creative && relative !== 'short-drama.json') || !EDITABLE_EXTENSION.test(relative))
        return undefined;
    if (relative.split('/').some(part => part === '..' || part === '.' || part === ''))
        return undefined;
    return relative;
}
export function workbenchModeForPath(path) {
    if (path === 'short-drama.json')
        return 'drama';
    const directory = path?.split('/', 1)[0];
    if (directory !== undefined && STORY_DIRECTORIES.has(directory))
        return 'story';
    if (directory !== undefined && DRAMA_DIRECTORIES.has(directory))
        return 'drama';
    return undefined;
}
/** Choose the first useful document when a creative workbench opens. */
export function preferredWorkbenchFile(files, mode) {
    const matching = files.filter(file => workbenchModeForPath(file.path) === mode);
    const preferences = mode === 'story'
        ? [/^正文\/.*\.md$/u, /^大纲\/.*\.md$/u, /\.md$/u]
        : [
            /^剧集\/EP0*1\/剧本\.md$/u,
            /^剧集\/.*\/剧本\.md$/u,
            /^剧集\/EP0*1\/screenplay\.md$/iu,
            /^剧集\/.*\/screenplay\.md$/iu,
            /^项目开发\/creative-brief\.md$/u,
            /^输入\/.*\.md$/u,
            /\.md$/u,
            /^short-drama\.json$/u,
        ];
    for (const pattern of preferences) {
        const match = matching.find(file => pattern.test(file.path));
        if (match !== undefined)
            return match.path;
    }
    return matching[0]?.path;
}
/** Project one streamed mutation over its immediate predecessor. */
export function previewMutation(activity, base) {
    if (activity.operation === 'replace-file')
        return activity.newText;
    if (activity.operation === 'replace-text') {
        if (activity.oldText === undefined || activity.newText === undefined || activity.oldText === '')
            return undefined;
        if (activity.replaceAll)
            return base.includes(activity.oldText) ? base.split(activity.oldText).join(activity.newText) : undefined;
        const at = base.indexOf(activity.oldText);
        return at < 0 ? undefined : `${base.slice(0, at)}${activity.newText}${base.slice(at + activity.oldText.length)}`;
    }
    if (activity.operation === 'insert-text') {
        if (activity.newText === undefined)
            return undefined;
        const rawLine = /"insert_line"\s*:\s*(\d+)/u.exec(activity.argsRaw)?.[1];
        if (rawLine === undefined)
            return undefined;
        const line = Number.parseInt(rawLine, 10);
        const parts = base.split('\n');
        const at = Math.max(0, Math.min(parts.length, line));
        parts.splice(at, 0, activity.newText);
        return parts.join('\n');
    }
    return undefined;
}
//# sourceMappingURL=file-activity.js.map