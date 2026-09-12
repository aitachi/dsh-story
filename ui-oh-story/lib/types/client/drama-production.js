export const PRODUCTION_PROTOCOL_VERSION = 'short-drama/v1';
const CREATOR_DOCUMENT_NAMES = new Set(['剧本.md', '视觉设定.md', '分镜.md', '图片提示词.md', '视频提示词.md']);
export function episodeDirectoryForPath(path) {
    if (path === undefined)
        return undefined;
    const match = /^(剧集\/[^/]+)\/[^/]+$/u.exec(path);
    return match?.[1];
}
export function isCreatorDocumentPath(path) {
    const directory = episodeDirectoryForPath(path);
    const name = path.split('/').at(-1);
    return directory !== undefined && name !== undefined && CREATOR_DOCUMENT_NAMES.has(name);
}
export function creatorDocumentPaths(files, episodeDirectory) {
    return files
        .map(file => file.path)
        .filter(path => path.startsWith(`${episodeDirectory}/`) && CREATOR_DOCUMENT_NAMES.has(path.slice(episodeDirectory.length + 1)))
        .sort((left, right) => creatorDocumentOrder(left) - creatorDocumentOrder(right) || left.localeCompare(right, 'zh-Hans-CN'));
}
export function parseEpisodeProduction(documents, episodeDirectory) {
    const storyboardPath = `${episodeDirectory}/分镜.md`;
    const imagePromptPath = `${episodeDirectory}/图片提示词.md`;
    const videoPromptPath = `${episodeDirectory}/视频提示词.md`;
    const visualPath = `${episodeDirectory}/视觉设定.md`;
    const shots = parseStoryboard(storyboardPath, documents[storyboardPath] ?? '');
    const assets = parseImagePrompts(imagePromptPath, documents[imagePromptPath] ?? '');
    const motions = parseVideoPrompts(videoPromptPath, documents[videoPromptPath] ?? '');
    const visualAssets = parseVisualAssets(visualPath, documents[visualPath] ?? '');
    const motionByShot = new Map(motions.flatMap(motion => motion.shotId === undefined ? [] : [[motion.shotId, motion]]));
    const linkedShots = shots.map(shot => ({ ...shot, motion: motionByShot.get(shot.id) }));
    const targets = new Map();
    for (const item of [...linkedShots, ...assets, ...motions, ...visualAssets]) {
        targets.set(item.id, { path: item.path, offset: item.offset, id: item.id });
    }
    for (const shot of linkedShots) {
        if (shot.source !== undefined) {
            const screenplayPath = `${episodeDirectory}/剧本.md`;
            const target = sectionTarget(screenplayPath, documents[screenplayPath] ?? '', shot.source);
            if (target !== undefined)
                targets.set(shot.source, target);
        }
    }
    const diagnostics = validateProductionProtocol({
        documents,
        episodeDirectory,
        shots: linkedShots,
        assets,
        visualAssets,
        motions,
    });
    return {
        protocolVersion: PRODUCTION_PROTOCOL_VERSION,
        episodeDirectory,
        shots: linkedShots,
        assets,
        visualAssets,
        motions,
        targets,
        documentPaths: Object.keys(documents).filter(path => path.startsWith(`${episodeDirectory}/`)),
        diagnostics,
    };
}
export function parseStoryboard(path, content) {
    return levelTwoSections(content).flatMap((section) => {
        const match = /^(SHOT-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
        if (match === null || match[1] === undefined)
            return [];
        const fields = bulletFields(section.body);
        const id = match[1].toLocaleUpperCase();
        return [{
                id,
                title: match[2]?.trim() || id,
                path,
                offset: section.offset,
                source: firstField(fields, '来源', '场次'),
                durationSeconds: seconds(firstField(fields, '时长')),
                purpose: firstField(fields, '目的', '镜头目的'),
                shotSpec: firstField(fields, '景别/机位', '景别', '镜头规格'),
                start: firstField(fields, '起点', '起始'),
                end: firstField(fields, '终点', '结束'),
                references: splitReferences(firstField(fields, '图片提示词项', '视觉依据', '输入参考图', '参考', '关联资产')),
                keyframePrompt: quoteUnderHeading(section.body, '冻结关键帧提示词'),
            }];
    });
}
export function parseImagePrompts(path, content) {
    return levelTwoSections(content).flatMap((section) => {
        const match = /^(IMG-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
        if (match === null || match[1] === undefined)
            return [];
        const fields = bulletFields(section.body);
        const id = match[1].toLocaleUpperCase();
        const title = match[2]?.trim() || id;
        return [{
                id,
                title,
                kind: inferAssetKind(`${id} ${title} ${firstField(fields, '用途') ?? ''}`),
                path,
                offset: section.offset,
                purpose: firstField(fields, '用途'),
                reference: firstField(fields, '参考', '参考约束'),
                prompt: quoteUnderHeading(section.body, '可复制提示词'),
            }];
    });
}
export function parseVideoPrompts(path, content) {
    return levelTwoSections(content).flatMap((section) => {
        const match = /^(MOTION-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
        if (match === null || match[1] === undefined)
            return [];
        const fields = bulletFields(section.body);
        const id = match[1].toLocaleUpperCase();
        const shotId = firstField(fields, '分镜', '镜头', '关联镜头')?.match(/SHOT-[A-Z0-9-]+/iu)?.[0]?.toLocaleUpperCase();
        return [{
                id,
                title: match[2]?.trim() || id,
                path,
                offset: section.offset,
                shotId,
                durationSeconds: seconds(firstField(fields, '时长')),
                startFrame: firstField(fields, '起始帧', '起点'),
                end: firstField(fields, '终点', '结束'),
                prompt: quoteUnderHeading(section.body, '可复制提示词'),
            }];
    });
}
export function parseVisualAssets(path, content) {
    return levelTwoSections(content).flatMap((section) => {
        const match = /^(人物|角色|造型|地点|场景|道具|状态)\s*(?:[·｜|:]\s*)?(.*)$/u.exec(section.heading.trim());
        if (match === null || match[1] === undefined)
            return [];
        const fields = bulletFields(section.body);
        const title = match[2]?.trim() || section.heading.trim();
        const declaredId = firstField(fields, 'ID', '资产 ID', '资产ID')?.trim().toLocaleUpperCase();
        const stableId = declaredId !== undefined && /^VISUAL-[A-Z0-9-]+$/u.test(declaredId);
        const id = stableId ? declaredId : `VISUAL-${slug(`${match[1]}-${title}`)}`;
        return [{ id, title, kind: inferAssetKind(`${match[1]} ${title}`), path, offset: section.offset, description: section.body.trim(), stableId, declaredId }];
    });
}
function validateProductionProtocol(input) {
    const diagnostics = [];
    const add = (value) => {
        diagnostics.push({ ...value, line: lineAt(input.documents[value.path] ?? '', value.offset) });
    };
    const all = [...input.shots, ...input.assets, ...input.visualAssets, ...input.motions];
    const byId = new Map();
    for (const item of all)
        byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
    for (const [id, items] of byId) {
        if (items.length < 2)
            continue;
        for (const item of items)
            add({ severity: 'error', code: 'duplicate_id', path: item.path, offset: item.offset, targetId: id, message: `${id} 在当前集内重复，后出现的条目会遮蔽前一条。` });
    }
    for (const visual of input.visualAssets) {
        if (visual.stableId)
            continue;
        add(visual.declaredId === undefined
            ? { severity: 'warning', code: 'generated_visual_id', path: visual.path, offset: visual.offset, targetId: visual.id, message: `${visual.title} 缺少稳定的 “- ID：VISUAL-*”；修改标题会改变画布节点身份。` }
            : { severity: 'warning', code: 'invalid_visual_id', path: visual.path, offset: visual.offset, targetId: visual.id, message: `${visual.title} 的 “- ID：${visual.declaredId}” 不是可用形式，已回退到标题派生 ID；请写成 VISUAL- 加大写字母、数字或连字符。` });
    }
    const knownReferences = new Set([...input.assets, ...input.visualAssets, ...input.shots, ...input.motions].map(item => item.id));
    const screenplayPath = `${input.episodeDirectory}/剧本.md`;
    for (const shot of input.shots) {
        for (const reference of shot.references) {
            if (!knownReferences.has(reference))
                add({ severity: 'warning', code: 'unknown_reference', path: shot.path, offset: shot.offset, targetId: shot.id, message: `${shot.id} 引用了未解析的 ${reference}。` });
        }
        if (shot.source !== undefined && sectionTarget(screenplayPath, input.documents[screenplayPath] ?? '', shot.source) === undefined) {
            add({ severity: 'warning', code: 'unknown_source', path: shot.path, offset: shot.offset, targetId: shot.id, message: `${shot.id} 的来源 ${shot.source} 在剧本中不存在。` });
        }
    }
    const shots = new Set(input.shots.map(shot => shot.id));
    const motionsByShot = new Map();
    for (const motion of input.motions) {
        if (motion.shotId === undefined) {
            add({ severity: 'warning', code: 'motion_without_shot', path: motion.path, offset: motion.offset, targetId: motion.id, message: `${motion.id} 没有可解析的 SHOT-* 分镜字段。` });
            continue;
        }
        if (!shots.has(motion.shotId))
            add({ severity: 'error', code: 'unknown_motion_shot', path: motion.path, offset: motion.offset, targetId: motion.id, message: `${motion.id} 指向不存在的 ${motion.shotId}。` });
        motionsByShot.set(motion.shotId, [...(motionsByShot.get(motion.shotId) ?? []), motion]);
    }
    for (const [shotId, motions] of motionsByShot) {
        if (motions.length < 2)
            continue;
        for (const motion of motions)
            add({ severity: 'error', code: 'multiple_motions', path: motion.path, offset: motion.offset, targetId: motion.id, message: `${shotId} 同时绑定了多个 MOTION，画布只能确定一个。` });
    }
    const parsedOffsets = new Set([...input.shots, ...input.assets, ...input.motions].map(item => `${item.path}:${String(item.offset)}`));
    for (const [path, prefix] of [
        [`${input.episodeDirectory}/分镜.md`, 'SHOT'],
        [`${input.episodeDirectory}/图片提示词.md`, 'IMG'],
        [`${input.episodeDirectory}/视频提示词.md`, 'MOTION'],
    ]) {
        for (const section of levelTwoSections(input.documents[path] ?? '')) {
            if (section.heading.toLocaleUpperCase().startsWith(prefix) && !parsedOffsets.has(`${path}:${String(section.offset)}`)) {
                add({ severity: 'error', code: 'malformed_heading', path, offset: section.offset, message: `无法解析标题 “${section.heading.trim()}”，需要稳定的 ${prefix}-* ID。` });
            }
        }
    }
    return diagnostics.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN') || left.offset - right.offset || left.code.localeCompare(right.code));
}
export function productionCompleteness(shot) {
    const keyframe = Boolean(shot.keyframePrompt?.trim());
    const motion = Boolean(shot.motion?.prompt?.trim());
    const references = shot.references.length > 0;
    return { keyframe, motion, references, complete: keyframe && motion };
}
function levelTwoSections(content) {
    const matches = [...content.matchAll(/^##\s+(.+)\s*$/gmu)];
    return matches.map((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = matches[index + 1]?.index ?? content.length;
        return { heading: match[1] ?? '', body: content.slice(start, end), offset: match.index ?? 0 };
    });
}
function bulletFields(body) {
    const fields = new Map();
    for (const match of body.matchAll(/^\s*[-*]\s+([^：:\n]+)[：:]\s*(.+?)\s*$/gmu)) {
        const key = match[1]?.trim().replace(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/u, '$1').trim();
        const value = match[2]?.trim();
        if (key !== undefined && value !== undefined)
            fields.set(key, value);
    }
    // 分镜/提示词文档存在 `**键**：值` 加粗写法(无列表符),同样纳入字段表;列表式优先。
    for (const match of body.matchAll(/^\s*\*\*([^：:\n]+?)\*\*\s*[：:]\s*(.+?)\s*$/gmu)) {
        const key = match[1]?.trim();
        const value = match[2]?.trim();
        if (key !== undefined && value !== undefined && !fields.has(key))
            fields.set(key, value);
    }
    return fields;
}
function firstField(fields, ...names) {
    for (const name of names) {
        const value = fields.get(name);
        if (value !== undefined && value !== '')
            return value;
    }
    return undefined;
}
function quoteUnderHeading(body, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const match = new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`, 'imu').exec(body);
    if (match?.[1] === undefined)
        return undefined;
    const lines = match[1].split(/\r?\n/u)
        .filter(line => /^\s*>/u.test(line))
        .map(line => line.replace(/^\s*>\s?/u, '').trimEnd());
    const value = lines.join('\n').trim();
    return value === '' ? undefined : value;
}
function seconds(value) {
    if (value === undefined)
        return undefined;
    const match = /([0-9]+(?:\.[0-9]+)?)\s*(?:s|秒)/iu.exec(value);
    if (match?.[1] === undefined)
        return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
function splitReferences(value) {
    if (value === undefined)
        return [];
    const ids = value.match(/(?:IMG|SHOT|MOTION)-[A-Z0-9-]+/giu) ?? [];
    return [...new Set(ids.map(id => id.toLocaleUpperCase()))];
}
function inferAssetKind(value) {
    if (/(人物|角色|造型|character|portrait|sheet)/iu.test(value))
        return 'character';
    if (/(地点|场景|环境|scene|location|corridor|room)/iu.test(value))
        return 'scene';
    if (/(道具|物件|prop|object)/iu.test(value))
        return 'prop';
    if (/(状态|state|look)/iu.test(value))
        return 'state';
    return 'unknown';
}
function slug(value) {
    return value.trim().toLocaleUpperCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/gu, '') || 'ITEM';
}
function lineAt(content, offset) {
    return content.slice(0, Math.max(0, offset)).split(/\r?\n/u).length;
}
function sectionTarget(path, content, id) {
    const offset = content.search(new RegExp(`^##\\s+${id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:\\s|$)`, 'imu'));
    return offset < 0 ? undefined : { path, offset, id };
}
function creatorDocumentOrder(path) {
    const name = path.split('/').at(-1);
    return ['剧本.md', '视觉设定.md', '分镜.md', '图片提示词.md', '视频提示词.md'].indexOf(name ?? '');
}
//# sourceMappingURL=drama-production.js.map