import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/gu;
function inline(source, key) {
    const nodes = [];
    let cursor = 0;
    for (const match of source.matchAll(INLINE)) {
        const token = match[0];
        const index = match.index;
        if (index > cursor)
            nodes.push(source.slice(cursor, index));
        if (token.startsWith('`'))
            nodes.push(_jsx("code", { children: token.slice(1, -1) }, `${key}-${String(index)}`));
        else if (token.startsWith('**'))
            nodes.push(_jsx("strong", { children: token.slice(2, -2) }, `${key}-${String(index)}`));
        else if (token.startsWith('~~'))
            nodes.push(_jsx("del", { children: token.slice(2, -2) }, `${key}-${String(index)}`));
        else if (token.startsWith('*'))
            nodes.push(_jsx("em", { children: token.slice(1, -1) }, `${key}-${String(index)}`));
        else {
            const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(token);
            nodes.push(link === null ? token : _jsx("a", { href: link[2], target: "_blank", rel: "noreferrer", children: link[1] }, `${key}-${String(index)}`));
        }
        cursor = index + token.length;
    }
    if (cursor < source.length)
        nodes.push(source.slice(cursor));
    return nodes;
}
function splitTableRow(line) {
    let source = line.trim();
    if (source.startsWith('|'))
        source = source.slice(1);
    if (source.endsWith('|'))
        source = source.slice(0, -1);
    const cells = [];
    let cell = '';
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index] ?? '';
        if (character === '\\' && source[index + 1] === '|') {
            cell += '|';
            index += 1;
        }
        else if (character === '|') {
            cells.push(cell.trim());
            cell = '';
        }
        else
            cell += character;
    }
    cells.push(cell.trim());
    return cells;
}
function tableAlignments(line) {
    const cells = splitTableRow(line);
    if (cells.length === 0 || !cells.every(cell => /^:?-{3,}:?$/u.test(cell)))
        return undefined;
    return cells.map((cell) => {
        if (cell.startsWith(':') && cell.endsWith(':'))
            return 'center';
        if (cell.endsWith(':'))
            return 'right';
        if (cell.startsWith(':'))
            return 'left';
        return undefined;
    });
}
function beginsBlock(lines, index) {
    const line = lines[index] ?? '';
    return /^(`{3,}|~{3,})\s*[\w-]*\s*$/u.test(line)
        || /^#{1,6}\s+/u.test(line)
        || /^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)
        || /^>\s?/u.test(line)
        || /^[-*+]\s+/u.test(line)
        || /^\d+[.)]\s+/u.test(line)
        || (line.includes('|') && tableAlignments(lines[index + 1] ?? '') !== undefined);
}
export function parseMarkdownBlocks(markdown) {
    const lines = markdown.replaceAll('\r\n', '\n').split('\n');
    const result = [];
    for (let index = 0; index < lines.length;) {
        const line = lines[index] ?? '';
        if (line.trim() === '') {
            index += 1;
            continue;
        }
        const fence = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/u.exec(line);
        if (fence !== null) {
            const marker = fence[1] ?? '```';
            const markerCharacter = marker[0] ?? '`';
            const closing = new RegExp(`^${markerCharacter}{${String(marker.length)},}\\s*$`, 'u');
            const code = [];
            index += 1;
            while (index < lines.length && !closing.test(lines[index] ?? '')) {
                code.push(lines[index] ?? '');
                index += 1;
            }
            if (index < lines.length)
                index += 1;
            result.push({ kind: 'code', lines: code, ...(fence[2] === undefined || fence[2] === '' ? {} : { language: fence[2] }) });
            continue;
        }
        const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
        if (heading !== null) {
            result.push({ kind: 'heading', text: heading[2] ?? '', level: heading[1]?.length ?? 1 });
            index += 1;
            continue;
        }
        if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
            result.push({ kind: 'rule' });
            index += 1;
            continue;
        }
        const alignments = line.includes('|') ? tableAlignments(lines[index + 1] ?? '') : undefined;
        if (alignments !== undefined) {
            const headers = splitTableRow(line);
            const rows = [];
            index += 2;
            while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim() !== '') {
                rows.push(splitTableRow(lines[index] ?? ''));
                index += 1;
            }
            result.push({ kind: 'table', headers, rows, alignments });
            continue;
        }
        if (/^>\s?/u.test(line)) {
            const quote = [];
            while (index < lines.length && /^>\s?/u.test(lines[index] ?? '')) {
                quote.push((lines[index] ?? '').replace(/^>\s?/u, ''));
                index += 1;
            }
            result.push({ kind: 'quote', lines: quote });
            continue;
        }
        const unordered = /^[-*+]\s+(.+)$/u.exec(line);
        const ordered = /^(\d+)[.)]\s+(.+)$/u.exec(line);
        if (unordered !== null || ordered !== null) {
            const kind = unordered !== null ? 'ul' : 'ol';
            const items = [];
            const pattern = kind === 'ul' ? /^[-*+]\s+(.+)$/u : /^\d+[.)]\s+(.+)$/u;
            const start = ordered === null ? undefined : Number(ordered[1]);
            while (index < lines.length) {
                const item = pattern.exec(lines[index] ?? '');
                if (item === null)
                    break;
                const source = item[1] ?? '';
                const task = /^\[([ xX])\]\s+(.+)$/u.exec(source);
                items.push(task === null ? { text: source } : { text: task[2] ?? '', checked: task[1]?.toLocaleLowerCase() === 'x' });
                index += 1;
            }
            result.push({ kind, items, ...(start === undefined ? {} : { start }) });
            continue;
        }
        const paragraph = [line];
        index += 1;
        while (index < lines.length) {
            const next = lines[index] ?? '';
            if (next.trim() === '' || beginsBlock(lines, index))
                break;
            paragraph.push(next);
            index += 1;
        }
        result.push({ kind: 'paragraph', lines: paragraph });
    }
    return result;
}
function Heading({ block, blockKey }) {
    const children = inline(block.text, blockKey);
    switch (block.level) {
        case 1: return _jsx("h1", { children: children });
        case 2: return _jsx("h2", { children: children });
        case 3: return _jsx("h3", { children: children });
        case 4: return _jsx("h4", { children: children });
        case 5: return _jsx("h5", { children: children });
        default: return _jsx("h6", { children: children });
    }
}
export function MarkdownPreview({ content, label }) {
    const parsed = parseMarkdownBlocks(content);
    if (parsed.length === 0)
        return _jsx("div", { className: "oh-story-markdown-empty", children: "\u8FD9\u4E2A Markdown \u6587\u4EF6\u8FD8\u662F\u7A7A\u7684\u3002" });
    return _jsx("article", { className: "oh-story-markdown", "aria-label": `${label} 渲染预览`, children: parsed.map((block, index) => {
            const key = `block-${String(index)}`;
            if (block.kind === 'code')
                return _jsx("pre", { children: _jsx("code", { "data-language": block.language, children: block.lines.join('\n') }) }, key);
            if (block.kind === 'rule')
                return _jsx("hr", {}, key);
            if (block.kind === 'quote')
                return _jsx("blockquote", { children: block.lines.map((line, lineIndex) => _jsx("p", { children: inline(line, `${key}-${String(lineIndex)}`) }, `${key}-${String(lineIndex)}`)) }, key);
            if (block.kind === 'ul' || block.kind === 'ol') {
                const items = block.items.map((item, itemIndex) => _jsxs("li", { className: item.checked === undefined ? undefined : 'oh-story-task-item', children: [item.checked === undefined ? null : _jsx("input", { type: "checkbox", checked: item.checked, readOnly: true, disabled: true, "aria-label": item.checked ? '已完成' : '未完成' }), inline(item.text, `${key}-${String(itemIndex)}`)] }, `${key}-${String(itemIndex)}`));
                return block.kind === 'ul' ? _jsx("ul", { children: items }, key) : _jsx("ol", { start: block.start, children: items }, key);
            }
            if (block.kind === 'table')
                return _jsx("div", { className: "oh-story-markdown-table", children: _jsxs("table", { children: [_jsx("thead", { children: _jsx("tr", { children: block.headers.map((cell, cellIndex) => _jsx("th", { style: { textAlign: block.alignments[cellIndex] }, children: inline(cell, `${key}-h-${String(cellIndex)}`) }, `${key}-h-${String(cellIndex)}`)) }) }), _jsx("tbody", { children: block.rows.map((row, rowIndex) => _jsx("tr", { children: block.headers.map((_, cellIndex) => _jsx("td", { style: { textAlign: block.alignments[cellIndex] }, children: inline(row[cellIndex] ?? '', `${key}-r-${String(rowIndex)}-${String(cellIndex)}`) }, `${key}-r-${String(rowIndex)}-${String(cellIndex)}`)) }, `${key}-r-${String(rowIndex)}`)) })] }) }, key);
            if (block.kind === 'heading')
                return _jsx(Heading, { block: block, blockKey: key }, key);
            if (block.kind === 'paragraph')
                return _jsx("p", { children: block.lines.map((line, lineIndex) => _jsxs("span", { children: [lineIndex === 0 ? null : _jsx("br", {}), inline(line, `${key}-${String(lineIndex)}`)] }, `${key}-${String(lineIndex)}`)) }, key);
            return null;
        }) });
}
//# sourceMappingURL=markdown-preview.js.map