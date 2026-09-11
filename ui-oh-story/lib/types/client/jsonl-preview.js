import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TITLE_KEYS = [
    'display_name', 'title', 'name', 'shot_id', 'scene_id', 'episode_id', 'character_id',
    'location_id', 'view_id', 'prop_id', 'state_id', 'decision_id', 'occurrence_id', 'record_id', 'id',
];
function objectRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
function stringField(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim() !== '')
            return value;
    }
    return undefined;
}
function metadata(value, line) {
    const record = objectRecord(value);
    if (record === undefined)
        return { title: typeof value === 'string' ? value : JSON.stringify(value) ?? `第 ${String(line)} 行` };
    const type = stringField(record, ['record_type', 'type', 'kind']);
    const acceptance = objectRecord(record.creator_acceptance);
    const status = stringField(record, ['status']) ?? (acceptance === undefined ? undefined : stringField(acceptance, ['status']));
    return {
        title: stringField(record, TITLE_KEYS) ?? `记录 ${String(line)}`,
        ...(type === undefined ? {} : { type }),
        ...(status === undefined ? {} : { status }),
    };
}
export function parseJsonl(content) {
    const records = [];
    const lines = content.replaceAll('\r\n', '\n').split('\n');
    for (const [index, raw] of lines.entries()) {
        if (raw.trim() === '')
            continue;
        try {
            const value = JSON.parse(raw);
            records.push({ line: index + 1, raw, value, ...metadata(value, index + 1) });
        }
        catch (error) {
            records.push({
                line: index + 1,
                raw,
                title: `第 ${String(index + 1)} 行格式错误`,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return records;
}
const PREVIEW_LIMIT = 200;
export function JsonlPreview({ content, label }) {
    const records = parseJsonl(content);
    if (records.length === 0)
        return _jsx("div", { className: "oh-story-markdown-empty", children: "\u8FD9\u4E2A JSONL \u6587\u4EF6\u8FD8\u662F\u7A7A\u7684\u3002" });
    const valid = records.filter(record => record.error === undefined).length;
    const errors = records.length - valid;
    const visible = records.slice(0, PREVIEW_LIMIT);
    return _jsxs("section", { className: "oh-story-jsonl", "aria-label": `${label} 结构化预览`, children: [_jsxs("header", { className: "oh-story-jsonl-summary", children: [_jsx("strong", { children: errors === 0 ? `${String(valid)} 条记录` : `${String(valid)} 条有效记录` }), errors > 0 && _jsxs("span", { children: [String(errors), " \u6761\u683C\u5F0F\u9519\u8BEF"] }), records.length > PREVIEW_LIMIT && _jsxs("span", { children: ["\u4EC5\u663E\u793A\u524D ", String(PREVIEW_LIMIT), " \u6761"] })] }), _jsx("div", { className: "oh-story-jsonl-records", children: visible.map(record => record.error === undefined
                    ? _jsxs("details", { open: records.length <= 2, children: [_jsxs("summary", { children: [_jsxs("span", { children: ["\u7B2C ", String(record.line), " \u884C"] }), _jsx("strong", { children: record.title }), record.type !== undefined && _jsx("code", { children: record.type }), record.status !== undefined && _jsx("em", { children: record.status })] }), _jsx("pre", { children: _jsx("code", { children: JSON.stringify(record.value, null, 2) }) })] }, record.line)
                    : _jsxs("div", { className: "oh-story-jsonl-error", role: "alert", children: [_jsx("strong", { children: record.title }), _jsx("span", { children: record.error }), _jsx("pre", { children: record.raw })] }, record.line)) })] });
}
//# sourceMappingURL=jsonl-preview.js.map