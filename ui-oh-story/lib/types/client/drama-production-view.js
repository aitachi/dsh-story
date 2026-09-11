import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { productionCompleteness } from './drama-production.js';
import { nativeBatchPrompt, nativeCompositionPrompt, nativeProductionPrompt } from './production-prompts.js';
import { activeProductionJobId, createPendingJob, queuedItemForJob, reconcileProductionJobs, reconcileSequence, referencesForTarget, reorderSequence, sequenceIssues, selectedVersionForTarget } from './production-runtime.js';
const SECTION_LABELS = { shots: '镜头', assets: '素材', tasks: '任务', sequence: '成片', canvas: '画布' };
const SECTION_ORDER = Object.keys(SECTION_LABELS);
const STATUS_LABELS = { awaiting_confirmation: '等待确认', pending: '已提交', running: 'DSH 执行中', dispatched_unknown: '待核对', succeeded: '已完成', failed: '失败', canceled: '已取消' };
const ASSET_KIND_LABEL = { character: '人物', scene: '场景', prop: '道具', state: '状态', unknown: '设定' };
const JOB_KIND_LABEL = { image: '图片', video: '视频', composition: '成片' };
function handleSectionKey(event, current, onChange) {
    const index = SECTION_ORDER.indexOf(current);
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? SECTION_ORDER.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % SECTION_ORDER.length
                : event.key === 'ArrowLeft' ? (index - 1 + SECTION_ORDER.length) % SECTION_ORDER.length
                    : undefined;
    if (next === undefined)
        return;
    event.preventDefault();
    onChange(SECTION_ORDER[next]);
    event.currentTarget.parentElement?.querySelectorAll("[role='tab']")[next]?.focus();
}
export function DramaProductionView(props) {
    const [notice, setNotice] = useState();
    const protocolErrors = props.production.diagnostics.filter(item => item.severity === 'error').length;
    const jobsRef = useRef(props.jobs);
    const commitJobs = useCallback((next) => {
        jobsRef.current = next;
        props.onJobsChange(next);
    }, [props.onJobsChange]);
    useEffect(() => { jobsRef.current = props.jobs; }, [props.jobs]);
    useEffect(() => {
        const next = reconcileSequence(props.production.shots.map(shot => shot.id), props.sequence, props.versions, props.selections);
        if (JSON.stringify(next) !== JSON.stringify(props.sequence))
            props.onSequenceChange(next);
    }, [props.production.shots, props.selections, props.sequence, props.versions]);
    useEffect(() => {
        const next = reconcileProductionJobs(props.jobs, props.queue, props.sessionRunning, props.versions);
        if (JSON.stringify(next) !== JSON.stringify(props.jobs))
            commitJobs(next);
    }, [commitJobs, props.jobs, props.queue, props.sessionRunning, props.versions]);
    const dispatchJob = async (job, references = []) => {
        commitJobs([...jobsRef.current, { ...job, status: 'awaiting_confirmation' }]);
        props.onSectionChange('tasks');
        try {
            await props.onDispatchPrompt(nativeProductionPrompt(props.production, job, references));
            setNotice(`${job.targetId} 正在准备完整预检；请在 Chat 查看并明确确认后再生产。`);
        }
        catch (error) {
            commitJobs(jobsRef.current.map(item => item.id === job.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) } : item));
        }
    };
    const createJob = async (targetId, kind, prompt) => {
        if (prompt.trim() === '') {
            setNotice(`${targetId} 没有可投产提示词。`);
            return;
        }
        const job = createPendingJob({ id: crypto.randomUUID(), targetId, kind, prompt });
        await dispatchJob(job, kind === 'video' ? referencesForTarget(targetId, props.production, props.versions, props.selections, props.libraryVersions, props.manualReferences) : []);
    };
    const createBatch = async (kind) => {
        const candidates = props.production.shots.flatMap((shot) => { const prompt = kind === 'image' ? shot.keyframePrompt : shot.motion?.prompt; return prompt === undefined ? [] : [{ id: shot.id, prompt }]; });
        if (candidates.length === 0) {
            setNotice(kind === 'image' ? '没有可投产的关键帧提示词。' : '没有可投产的视频提示词。');
            return;
        }
        const job = createPendingJob({ id: crypto.randomUUID(), targetId: kind === 'image' ? 'BATCH-KEYFRAMES' : 'BATCH-VIDEOS', kind, prompt: candidates.map(item => `${item.id}\n${item.prompt}`).join('\n\n'), expectedOutputs: candidates.length });
        commitJobs([...jobsRef.current, { ...job, status: 'awaiting_confirmation' }]);
        props.onSectionChange('tasks');
        try {
            await props.onDispatchPrompt(nativeBatchPrompt(props.production, job, candidates));
            setNotice(`${String(candidates.length)} 个镜头正在准备同一批次预检；请在 Chat 核对后明确确认。`);
        }
        catch (error) {
            commitJobs(jobsRef.current.map(item => item.id === job.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) } : item));
        }
    };
    const dispatchComposition = async (job) => {
        const versionById = new Map(props.versions.map(version => [version.id, version]));
        const ordered = props.sequence.flatMap((item) => { const version = item.versionId === undefined ? undefined : versionById.get(item.versionId); return version === undefined ? [] : [version.path ?? version.url]; });
        commitJobs([...jobsRef.current, job]);
        props.onSectionChange('tasks');
        try {
            await props.onDispatchPrompt(nativeCompositionPrompt(props.production, job, ordered));
            setNotice('成片任务已进入 DSH 原生队列；文件、FFmpeg 和写入继续受 DSH 权限与审批控制。');
        }
        catch (error) {
            commitJobs(jobsRef.current.map(item => item.id === job.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) } : item));
        }
    };
    const cancelJob = async (job) => {
        try {
            await props.onCancelTurn();
            commitJobs(jobsRef.current.map(item => item.id === job.id ? { ...item, status: 'canceled', progress: 0 } : item));
            setNotice('已请求停止当前 DSH Turn；DSH Queue 中的其他任务会保留。');
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
        }
    };
    const removeQueuedJob = async (job, itemId) => {
        try {
            await props.onRemoveQueued(itemId);
            commitJobs(jobsRef.current.map(item => item.id === job.id ? { ...item, status: 'canceled', progress: 0 } : item));
            setNotice(`${job.targetId} 已从 DSH Queue 移除。`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
        }
    };
    const composeSequence = () => { const issues = sequenceIssues(props.sequence, props.versions); if (issues.length > 0) {
        setNotice(issues[0]);
        return;
    } void dispatchComposition(createPendingJob({ id: crypto.randomUUID(), targetId: props.production.episodeDirectory, kind: 'composition', prompt: '按成片顺序合成' })); };
    return _jsxs("div", { className: "oh-story-production", children: [_jsxs("div", { className: "oh-story-production-bar", children: [_jsx("div", { className: "oh-story-production-tabs", role: "tablist", "aria-label": "\u77ED\u5267\u751F\u4EA7\u89C6\u56FE", children: SECTION_ORDER.map(item => _jsx("button", { type: "button", role: "tab", tabIndex: props.section === item ? 0 : -1, "aria-selected": props.section === item, onKeyDown: (event) => { handleSectionKey(event, item, props.onSectionChange); }, onClick: () => { props.onSectionChange(item); }, children: SECTION_LABELS[item] }, item)) }), _jsxs("div", { className: "oh-story-production-meta", children: [_jsxs("span", { className: "oh-story-production-summary", children: [props.production.shots.length, " \u955C \u00B7 ", props.production.assets.length + props.production.visualAssets.length, " \u7D20\u6750 \u00B7 ", props.jobs.filter(job => job.status === 'awaiting_confirmation' || job.status === 'running' || job.status === 'pending').length, " \u4EFB\u52A1"] }), _jsx("button", { type: "button", onClick: props.onRefresh, children: "\u5237\u65B0" })] })] }), notice !== undefined && _jsxs("div", { className: "oh-story-production-notice", role: "status", children: [_jsx("span", { children: notice }), _jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => { setNotice(undefined); }, children: "\u00D7" })] }), props.production.diagnostics.length > 0 && _jsxs("details", { className: "oh-story-production-diagnostics", children: [_jsx("summary", { children: protocolErrors > 0 ? `${String(protocolErrors)} 个协议错误` : `${String(props.production.diagnostics.length)} 个格式提醒` }), _jsx("ul", { children: props.production.diagnostics.slice(0, 8).map(item => _jsxs("li", { "data-severity": item.severity, children: [_jsxs("button", { type: "button", onClick: () => { props.onNavigate({ path: item.path, offset: item.offset, id: item.targetId ?? item.code }); }, children: [item.path.split('/').at(-1), ":", item.line] }), _jsx("span", { children: item.message })] }, `${item.path}:${String(item.offset)}:${item.code}`)) }), props.production.diagnostics.length > 8 && _jsxs("p", { children: ["\u53E6\u6709 ", props.production.diagnostics.length - 8, " \u9879\uFF0C\u8BF7\u6309\u6587\u6863\u4F4D\u7F6E\u4FEE\u590D\u3002"] })] }), props.section === 'shots' && _jsx(ShotBoard, { ...props, onCreateJob: createJob, onBatch: createBatch }), props.section === 'assets' && _jsx(AssetBoard, { ...props, onCreateJob: createJob }), props.section === 'tasks' && _jsx(TaskBoard, { jobs: props.jobs, queue: props.queue, sessionRunning: props.sessionRunning, onCancel: cancelJob, onRemoveQueued: removeQueuedJob }), props.section === 'sequence' && _jsx(SequenceBoard, { ...props, onCompose: composeSequence }), props.section === 'canvas' && _jsx(ProductionCanvas, { ...props })] });
}
function ShotBoard(props) {
    const selectedRef = useScrollIntoView(props.selectedId);
    if (props.production.shots.length === 0)
        return _jsx("section", { className: "oh-story-shot-board", children: _jsx(MissingDocument, { document: `${props.production.episodeDirectory}/分镜.md`, documentPaths: props.production.documentPaths, what: "\u955C\u5934", skill: "/short-drama-storyboard", onNavigate: props.onNavigate }) });
    return _jsxs("section", { className: "oh-story-shot-board", children: [_jsxs("div", { className: "oh-story-production-actions", children: [_jsx("button", { type: "button", onClick: () => { void props.onBatch('image'); }, children: "\u51C6\u5907\u6279\u91CF\u5173\u952E\u5E27" }), _jsx("button", { type: "button", onClick: () => { void props.onBatch('video'); }, children: "\u51C6\u5907\u6279\u91CF\u89C6\u9891" })] }), _jsx("div", { className: "oh-story-shot-grid", children: props.production.shots.map((shot) => {
                    const completeness = productionCompleteness(shot);
                    const versions = props.versions.filter(version => version.targetId === shot.id);
                    const selected = selectedVersionForTarget(shot.id, props.versions, props.selections, 'image') ?? selectedVersionForTarget(shot.id, props.versions, props.selections, 'video');
                    return _jsxs("article", { className: "oh-story-shot-card", role: "button", tabIndex: 0, "aria-pressed": props.selectedId === shot.id, "aria-label": `选中镜头 ${shot.id} ${shot.title}`, ref: props.selectedId === shot.id ? selectedRef : undefined, "data-selected": props.selectedId === shot.id || undefined, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            props.onSelect(shot.id);
                        } }, onClick: () => { props.onSelect(shot.id); }, children: [selected === undefined ? _jsxs("div", { className: "oh-story-shot-placeholder", children: [_jsx("strong", { children: shot.id.split('-').at(-1) }), _jsx("span", { children: "\u7B49\u5F85\u5173\u952E\u5E27\u6210\u679C" })] }) : _jsx(MediaPreview, { version: selected }), _jsxs("header", { children: [_jsx("button", { type: "button", onClick: (event) => { event.stopPropagation(); props.onNavigate({ path: shot.path, offset: shot.offset, id: shot.id }); }, children: shot.id }), _jsx("span", { children: shot.durationSeconds === undefined ? '—' : `${String(shot.durationSeconds)}s` })] }), _jsx("h3", { children: shot.title }), shot.shotSpec !== undefined && _jsx("p", { children: shot.shotSpec }), _jsxs("dl", { children: [_jsx("dt", { children: "\u8D77" }), _jsx("dd", { children: shot.start ?? '未填写' }), _jsx("dt", { children: "\u7EC8" }), _jsx("dd", { children: shot.end ?? '未填写' })] }), _jsxs("div", { className: "oh-story-shot-status", children: [_jsx(ReadinessBadge, { label: "\u5173\u952E\u5E27", ready: completeness.keyframe }), _jsx(ReadinessBadge, { label: "\u8FD0\u52A8", ready: completeness.motion }), _jsx(ReadinessBadge, { label: "\u53C2\u8003", ready: completeness.references }), _jsxs("span", { children: [versions.length, " \u7248\u672C"] })] }), _jsxs("div", { className: "oh-story-reference-links", children: [shot.source !== undefined && _jsx(ReferenceButton, { id: shot.source, production: props.production, onNavigate: props.onNavigate }), shot.references.map(id => _jsx(ReferenceButton, { id: id, production: props.production, onNavigate: props.onNavigate }, id))] }), _jsxs("div", { className: "oh-story-card-actions", children: [shot.keyframePrompt !== undefined && _jsx("button", { type: "button", onClick: (event) => { event.stopPropagation(); void props.onCreateJob(shot.id, 'image', shot.keyframePrompt ?? ''); }, children: "\u51C6\u5907\u5173\u952E\u5E27" }), shot.motion?.prompt !== undefined && _jsx("button", { type: "button", onClick: (event) => { event.stopPropagation(); void props.onCreateJob(shot.id, 'video', shot.motion?.prompt ?? ''); }, children: "\u51C6\u5907\u89C6\u9891" })] }), versions.length > 1 && _jsx(VersionStrip, { targetId: shot.id, versions: versions, selections: props.selections, onSelectionsChange: props.onSelectionsChange })] }, shot.id);
                }) })] });
}
function AssetBoard(props) {
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('all');
    const assets = [...props.production.assets, ...props.production.visualAssets.filter(visual => !props.production.assets.some(asset => asset.title === visual.title))];
    const needle = query.trim().toLocaleLowerCase();
    const library = props.libraryVersions.filter(version => (kind === 'all' || version.kind === kind) && (needle === '' || `${version.targetId} ${version.path ?? ''}`.toLocaleLowerCase().includes(needle)));
    const selectedRef = useScrollIntoView(props.selectedId);
    const referenceTarget = props.selectedId?.startsWith('SHOT-') === true ? props.selectedId : undefined;
    const toggleReference = (versionId) => {
        if (referenceTarget === undefined)
            return;
        const current = props.manualReferences[referenceTarget] ?? [];
        const next = current.includes(versionId) ? current.filter(id => id !== versionId) : [...current, versionId];
        const mutable = Object.fromEntries(Object.entries(props.manualReferences).map(([target, ids]) => [target, [...ids]]));
        props.onManualReferencesChange({ ...mutable, [referenceTarget]: next });
    };
    if (assets.length === 0 && props.libraryVersions.length === 0)
        return _jsx("section", { className: "oh-story-assets", children: _jsx(MissingDocument, { document: `${props.production.episodeDirectory}/图片提示词.md`, documentPaths: props.production.documentPaths, what: "\u7D20\u6750", skill: "/short-drama-image-prompts", onNavigate: props.onNavigate }) });
    return _jsxs("section", { className: "oh-story-assets", children: [_jsx("div", { className: "oh-story-asset-grid", children: assets.map((asset) => { const prompt = 'prompt' in asset ? asset.prompt : asset.description; const versions = props.versions.filter(version => version.targetId === asset.id); const selected = selectedVersionForTarget(asset.id, props.versions, props.selections, 'image'); return _jsxs("article", { className: "oh-story-asset-card", ref: props.selectedId === asset.id ? selectedRef : undefined, "data-selected": props.selectedId === asset.id || undefined, children: [selected === undefined ? _jsx("div", { className: "oh-story-asset-placeholder", children: asset.kind === 'character' ? '人' : asset.kind === 'scene' ? '景' : asset.kind === 'prop' ? '物' : '设' }) : _jsx(MediaPreview, { version: selected }), _jsxs("div", { children: [_jsx("small", { children: ASSET_KIND_LABEL[asset.kind] }), _jsx("h3", { children: asset.title }), _jsx("button", { type: "button", onClick: () => { props.onNavigate({ path: asset.path, offset: asset.offset, id: asset.id }); }, children: asset.id })] }), prompt !== undefined && _jsx("p", { className: "oh-story-asset-description", children: prompt }), _jsx("div", { className: "oh-story-card-actions", children: prompt !== undefined && _jsx("button", { type: "button", onClick: () => { void props.onCreateJob(asset.id, 'image', prompt); }, children: "\u51C6\u5907\u7D20\u6750" }) }), versions.length > 0 && _jsx(VersionStrip, { targetId: asset.id, versions: versions, selections: props.selections, onSelectionsChange: props.onSelectionsChange })] }, asset.id); }) }), _jsxs("div", { className: "oh-story-media-library", children: [_jsxs("header", { children: [_jsxs("div", { children: [_jsx("strong", { children: "\u9879\u76EE\u5A92\u4F53\u5E93" }), _jsxs("span", { children: [library.length, "/", props.libraryVersions.length, " \u9879 \u00B7 \u53EF\u8DE8\u96C6\u590D\u7528"] })] }), _jsxs("div", { children: [_jsx("input", { "aria-label": "\u641C\u7D22\u9879\u76EE\u5A92\u4F53", value: query, placeholder: "\u641C\u7D22 ID \u6216\u8DEF\u5F84", onChange: (event) => { setQuery(event.target.value); } }), _jsxs("select", { "aria-label": "\u7B5B\u9009\u5A92\u4F53\u7C7B\u578B", value: kind, onChange: (event) => { setKind(event.target.value); }, children: [_jsx("option", { value: "all", children: "\u5168\u90E8" }), _jsx("option", { value: "image", children: "\u56FE\u7247" }), _jsx("option", { value: "video", children: "\u89C6\u9891" })] })] })] }), referenceTarget === undefined && _jsx("p", { className: "oh-story-projection-note", children: "\u5148\u5728\u955C\u5934\u9875\u9009\u4E2D\u4E00\u4E2A\u955C\u5934\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u628A\u5DF2\u6709\u56FE\u7247\u8BBE\u4E3A\u8BE5\u955C\u5934\u7684\u989D\u5916\u53C2\u8003\u3002" }), _jsx("div", { className: "oh-story-media-library-grid", children: library.map((version) => { const selected = referenceTarget !== undefined && (props.manualReferences[referenceTarget] ?? []).includes(version.id); return _jsxs("article", { children: [_jsx(MediaPreview, { version: version }), _jsx("strong", { children: version.targetId }), _jsx("span", { title: version.path, children: version.path }), _jsxs("footer", { children: [version.path !== undefined && _jsx("button", { type: "button", onClick: () => { props.onOpenMedia(version.path); }, children: "\u6253\u5F00\u6587\u4EF6" }), referenceTarget !== undefined && version.kind === 'image' && _jsx("button", { type: "button", "aria-pressed": selected, "aria-label": `${selected ? '取消' : '设为'} ${referenceTarget} 参考 ${version.targetId}`, onClick: () => { toggleReference(version.id); }, children: selected ? '已引用' : '作为参考' })] })] }, version.id); }) })] })] });
}
function TaskBoard({ jobs, queue, sessionRunning, onCancel, onRemoveQueued }) {
    const activeJobId = activeProductionJobId(jobs, queue, sessionRunning);
    return _jsxs("section", { className: "oh-story-task-board", children: [_jsx("div", { className: "oh-story-projection-note", children: "\u56FE\u7247\u4E0E\u89C6\u9891\u5148\u9884\u68C0\u3001\u540E\u786E\u8BA4\u3002\u5185\u7F6E\u5951\u7EA6\u652F\u6301 GPT Image 2 / Seedance\uFF1B\u5B9E\u9645\u8D26\u53F7\u3001\u6A21\u578B\u4E0E\u53EF\u7528\u6027\u7531\u5F53\u524D DSH \u8FD0\u884C\u73AF\u5883\u51B3\u5B9A\u3002" }), jobs.length === 0 ? _jsx("div", { className: "oh-story-production-empty", children: "\u8FD8\u6CA1\u6709\u751F\u4EA7\u4EFB\u52A1\u3002\u53EF\u4ECE\u955C\u5934\u6216\u7D20\u6750\u9875\u63D0\u4EA4\u5355\u4E2A\u6216\u6279\u91CF\u4EFB\u52A1\u3002" }) : [...jobs].reverse().map((job) => {
                const queued = queuedItemForJob(job.id, queue);
                const displayStatus = queued === undefined ? STATUS_LABELS[job.status] : 'DSH Queue';
                return _jsxs("article", { "data-job-id": job.id, "data-status": job.status, children: [_jsxs("header", { children: [_jsx("strong", { title: job.targetId, children: job.targetId }), _jsx("span", { children: JOB_KIND_LABEL[job.kind] }), _jsx("span", { children: displayStatus })] }), _jsx("div", { className: "oh-story-task-progress", children: _jsx("i", { style: { width: `${String(job.progress)}%` } }) }), _jsxs("details", { children: [_jsx("summary", { children: "\u67E5\u770B\u6295\u4EA7\u63D0\u793A\u8BCD" }), _jsx("p", { children: job.prompt })] }), job.expectedOutputs > 1 && _jsxs("small", { children: [job.completedOutputs, "/", job.expectedOutputs, " \u9879\u6210\u679C"] }), job.error !== undefined && _jsx("div", { className: "oh-story-error", children: job.error }), job.output !== undefined && _jsx(MediaPreview, { version: job.output }), _jsxs("footer", { children: [queued !== undefined && (job.status === 'awaiting_confirmation' || job.status === 'pending' || job.status === 'running') && _jsx("button", { type: "button", onClick: () => { void onRemoveQueued(job, queued.id); }, children: "\u4ECE DSH Queue \u79FB\u9664" }), activeJobId === job.id && _jsx("button", { type: "button", onClick: () => { void onCancel(job); }, children: "\u505C\u6B62\u5F53\u524D DSH Turn" })] })] }, job.id);
            })] });
}
function SequenceBoard(props) {
    const issues = sequenceIssues(props.sequence, props.versions);
    const versionById = new Map(props.versions.map(version => [version.id, version]));
    const move = (index, delta) => { const source = props.sequence[index]; const target = props.sequence[index + delta]; if (source !== undefined && target !== undefined)
        props.onSequenceChange(reorderSequence(props.sequence, index, index + delta)); };
    return _jsxs("section", { className: "oh-story-sequence", children: [_jsxs("div", { className: "oh-story-sequence-summary", children: [_jsxs("strong", { children: [props.sequence.length, " \u4E2A\u955C\u5934"] }), _jsx("span", { children: props.sequence.length === 0 ? '还没有镜头' : issues.length === 0 ? '已可合成' : `${String(issues.length)} 个阻塞项` }), _jsx("button", { type: "button", disabled: issues.length > 0 || props.sequence.length < 2, onClick: props.onCompose, children: "\u5408\u6210\u6210\u7247" })] }), issues.length > 0 && _jsxs("ul", { className: "oh-story-sequence-issues", children: [issues.slice(0, 3).map(issue => _jsx("li", { children: issue }, issue)), issues.length > 3 && _jsxs("li", { children: ["\u53E6\u6709 ", issues.length - 3, " \u4E2A\u963B\u585E\u9879\uFF0C\u8BF7\u5728\u4E0B\u65B9\u955C\u5934\u884C\u8865\u9F50\u89C6\u9891\u3002"] })] }), _jsx("ol", { children: props.sequence.map((item, index) => { const version = item.versionId === undefined ? undefined : versionById.get(item.versionId); return _jsxs("li", { children: [_jsx("span", { children: String(index + 1).padStart(2, '0') }), version === undefined ? _jsx("div", { className: "oh-story-sequence-missing", children: "\u7F3A\u5C11\u89C6\u9891" }) : _jsx(MediaPreview, { version: version, interactive: false }), _jsx("strong", { children: item.shotId }), _jsxs("div", { children: [_jsx("button", { type: "button", "aria-label": `上移 ${item.shotId}`, disabled: index === 0, onClick: () => { move(index, -1); }, children: "\u2191" }), _jsx("button", { type: "button", "aria-label": `下移 ${item.shotId}`, disabled: index === props.sequence.length - 1, onClick: () => { move(index, 1); }, children: "\u2193" })] })] }, item.shotId); }) })] });
}
function ProductionCanvas(props) {
    const nodes = useMemo(() => { const sourceAssets = [...props.production.assets, ...props.production.visualAssets]; const assets = sourceAssets.map((asset, index) => ({ id: asset.id, label: asset.title, type: 'asset', initial: { x: 80, y: 80 + index * 150 } })); const shots = props.production.shots.map((shot, index) => ({ id: shot.id, label: shot.title, type: 'shot', initial: { x: 640, y: 80 + index * 180 } })); return [...assets, ...shots]; }, [props.production.assets, props.production.shots, props.production.visualAssets]);
    const positions = Object.fromEntries(nodes.map(node => [node.id, props.canvas[node.id] ?? node.initial]));
    const startDrag = (event, id) => { event.currentTarget.setPointerCapture(event.pointerId); const origin = positions[id] ?? { x: 0, y: 0 }; const start = { x: event.clientX, y: event.clientY }; const move = (moveEvent) => { props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + (moveEvent.clientX - start.x) / props.zoom, y: origin.y + (moveEvent.clientY - start.y) / props.zoom } }); }; const end = () => { globalThis.removeEventListener('pointermove', move); globalThis.removeEventListener('pointerup', end); }; globalThis.addEventListener('pointermove', move); globalThis.addEventListener('pointerup', end); };
    const moveNode = (id, x, y) => { const origin = positions[id] ?? { x: 0, y: 0 }; props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + x, y: origin.y + y } }); };
    const connections = props.production.shots.flatMap(shot => shot.references.map(reference => [reference, shot.id]));
    if (nodes.length === 0)
        return _jsx("section", { className: "oh-story-canvas-shell", "aria-label": "\u77ED\u5267\u7D20\u6750\u4E0E\u955C\u5934\u5173\u7CFB\u753B\u5E03", children: _jsx(MissingDocument, { document: `${props.production.episodeDirectory}/分镜.md`, documentPaths: props.production.documentPaths, what: "\u5173\u7CFB", skill: "/short-drama-storyboard", onNavigate: props.onNavigate }) });
    return _jsxs("section", { className: "oh-story-canvas-shell", "aria-label": "\u77ED\u5267\u7D20\u6750\u4E0E\u955C\u5934\u5173\u7CFB\u753B\u5E03", children: [_jsx("div", { className: "oh-story-projection-note", children: "\u6587\u6863\u5173\u7CFB \u00B7 \u5E03\u5C40\u4EC5\u4FDD\u5B58\u5728\u5F53\u524D DSH Session" }), _jsxs("div", { className: "oh-story-canvas-controls", children: [_jsx("button", { type: "button", "aria-label": "\u7F29\u5C0F\u753B\u5E03", onClick: () => { props.onZoomChange(Math.max(.5, props.zoom - .1)); }, children: "\u2212" }), _jsxs("span", { children: [Math.round(props.zoom * 100), "%"] }), _jsx("button", { type: "button", "aria-label": "\u653E\u5927\u753B\u5E03", onClick: () => { props.onZoomChange(Math.min(1.8, props.zoom + .1)); }, children: "\uFF0B" }), _jsx("button", { type: "button", onClick: () => { props.onCanvasChange({}); props.onZoomChange(.65); }, children: "\u590D\u4F4D" })] }), _jsx("div", { className: "oh-story-canvas-viewport", children: _jsxs("div", { className: "oh-story-canvas", style: { transform: `scale(${String(props.zoom)})` }, children: [_jsx("svg", { "aria-hidden": "true", children: connections.map(([from, to]) => { const a = positions[from]; const b = positions[to]; if (a === undefined || b === undefined)
                                return null; return _jsx("path", { "data-active": to === props.selectedId || undefined, d: `M ${String(a.x + 180)} ${String(a.y + 50)} C ${String(a.x + 360)} ${String(a.y + 50)}, ${String(b.x - 180)} ${String(b.y + 50)}, ${String(b.x)} ${String(b.y + 50)}` }, `${from}:${to}`); }) }), nodes.map(node => _jsxs("article", { tabIndex: 0, "aria-label": `${node.type === 'asset' ? '素材' : '镜头'} ${node.label}`, "data-node-type": node.type, "data-selected": node.id === props.selectedId || undefined, style: { left: positions[node.id]?.x, top: positions[node.id]?.y }, onKeyDown: (event) => { const step = event.shiftKey ? 40 : 10; const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined; if (delta !== undefined) {
                                event.preventDefault();
                                moveNode(node.id, delta[0], delta[1]);
                            } }, onPointerDown: (event) => { startDrag(event, node.id); }, onDoubleClick: () => { const target = props.production.targets.get(node.id); if (target !== undefined)
                                props.onNavigate(target); }, children: [_jsx("small", { children: node.type === 'asset' ? '素材' : '镜头' }), _jsx("strong", { children: node.label }), _jsx("span", { children: node.id })] }, node.id))] }) })] });
}
/** Scroll the card an Agent focus_target selected into view; without it the tab switches but the card stays off-screen. */
function useScrollIntoView(selectedId) {
    const ref = useRef(null);
    useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, [selectedId]);
    return ref;
}
function ReadinessBadge({ label, ready }) {
    return _jsxs("span", { "data-ready": ready, "aria-label": `${label}${ready ? '已备' : '待补'}`, children: [_jsx("i", { "aria-hidden": "true", children: ready ? '✓' : '—' }), label] });
}
function MissingDocument({ document, documentPaths, what, skill, onNavigate }) {
    const present = documentPaths.includes(document);
    return _jsxs("div", { className: "oh-story-production-empty", children: [_jsxs("strong", { children: ["\u8FD8\u6CA1\u6709\u53EF\u6295\u5F71\u7684", what, "\u3002"] }), _jsx("p", { children: present
                    ? `${document} 已存在，但没有解析出条目。请检查二级标题是否为稳定的 ID 形式。`
                    : `本集还没有 ${document}。在右侧 Chat 用 ${skill} 写好这份文档后，这里会自动出现。` }), present && _jsxs("button", { type: "button", onClick: () => { onNavigate({ path: document, offset: 0, id: document }); }, children: ["\u6253\u5F00 ", document.split('/').at(-1)] })] });
}
function ReferenceButton({ id, production, onNavigate }) { const target = production.targets.get(id); return _jsx("button", { type: "button", disabled: target === undefined, onClick: (event) => { event.stopPropagation(); if (target !== undefined)
        onNavigate(target); }, children: id }); }
function MediaPreview({ version, interactive = true }) { return version.kind === 'image' ? _jsx("img", { className: "oh-story-media-preview", src: version.url, alt: version.targetId, loading: "lazy" }) : _jsx("video", { className: "oh-story-media-preview", src: version.url, controls: interactive, muted: !interactive, preload: "metadata" }); }
function VersionStrip({ targetId, versions, selections, onSelectionsChange }) { const selected = selectedVersionForTarget(targetId, versions, selections)?.id; return _jsx("div", { className: "oh-story-version-strip", "aria-label": `${targetId} 成果版本`, children: versions.map((version, index) => _jsxs("button", { type: "button", "aria-pressed": version.id === selected, "aria-label": `选择 ${targetId} 版本 ${String(index + 1)}`, "data-selected": version.id === selected || undefined, onClick: (event) => { event.stopPropagation(); onSelectionsChange({ ...selections, [targetId]: version.id }); }, children: [_jsx(MediaPreview, { version: version, interactive: false }), _jsxs("span", { children: ["V", String(index + 1)] })] }, version.id)) }); }
//# sourceMappingURL=drama-production-view.js.map