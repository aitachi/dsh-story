import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { defineStore } from '@deepseek-ai/dsh-client-store';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { creativeRelativePath, fileMutations, latestSettledMutation, mutatingCallIds, preferredWorkbenchFile, previewMutation, streamingAssistant, workbenchModeForPath, } from './file-activity.js';
import { buildFileTree } from './file-tree.js';
import { JsonlPreview } from './jsonl-preview.js';
import { MarkdownPreview } from './markdown-preview.js';
import { creatorDocumentPaths, episodeDirectoryForPath, isCreatorDocumentPath, parseEpisodeProduction, } from './drama-production.js';
import { CanvasDocument } from './canvas-document.js';
import { createPendingJob, mediaTargetFromPath, } from './production-runtime.js';
import { settledProductionIntents } from './production-intents.js';
import { OH_STORY_PRODUCTION_TOOL_NAME } from './production-intent.js';
import styles from './plugin.css?inline';
export const name = 'oh-story-ui';
export const inject = ['slots', 'sessions', 'conversation'];
function applyUpdate(current, update) {
    return typeof update === 'function' ? update(current) : update;
}
function createWorkbenchStore() {
    return defineStore({
        init: () => ({
            buffers: {},
            editorMode: 'preview',
            expanded: {},
            selected: undefined,
            workbench: 'story',
            productionSection: 'shots',
            productionSelectedIds: {},
            productionJobs: {},
            productionSelections: {},
            productionReferences: {},
            productionSequence: {},
            productionCanvas: {},
            productionZoom: {},
            productionIntentCalls: {},
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
            },
        },
    });
}
class WorkspaceRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
const GROUP_ORDER = {
    story: ['正文', '大纲', '设定', '追踪', '对标', '参考资料'],
    drama: ['项目', '输入', '项目开发', '设定集', '剧集', '审查', '创作者决策', '交付'],
};
const WORKBENCH_MODES = ['story', 'drama'];
const EDITOR_MODES = ['preview', 'source', 'production'];
function handleTabKey(event, values, current, select) {
    let index;
    if (event.key === 'Home')
        index = 0;
    else if (event.key === 'End')
        index = values.length - 1;
    else if (event.key === 'ArrowRight')
        index = (values.indexOf(current) + 1) % values.length;
    else if (event.key === 'ArrowLeft')
        index = (values.indexOf(current) - 1 + values.length) % values.length;
    if (index === undefined)
        return;
    event.preventDefault();
    const value = values[index];
    if (value === undefined)
        return;
    select(value);
    event.currentTarget.parentElement?.querySelectorAll("[role='tab']")[index]?.focus();
}
function groupForPath(path) {
    return path === 'short-drama.json' ? '项目' : path.split('/', 1)[0] ?? '其他';
}
function endpoint(path, sessionId, file) {
    const url = new URL(`/oh-story/${path}`, globalThis.location.origin);
    url.searchParams.set('sessionId', sessionId);
    if (file !== undefined)
        url.searchParams.set('path', file);
    return url.toString();
}
async function json(response) {
    const value = await response.json();
    if (!response.ok)
        throw new WorkspaceRequestError(response.status, value.error ?? `HTTP ${String(response.status)}`);
    return value;
}
function FileTreeNodes({ nodes, depth, expanded, selected, activityPath, onToggle, onSelect, }) {
    return _jsx(_Fragment, { children: nodes.map((node) => {
            if (node.kind === 'file')
                return _jsx("button", { type: "button", style: { '--oh-story-indent': `${String(depth * 14)}px` }, title: node.path, "aria-label": node.path, "data-file-path": node.path, "data-agent-target": node.path === activityPath || undefined, "aria-current": node.path === selected ? 'page' : undefined, onClick: () => { onSelect(node.path); }, children: node.name }, node.path);
            const open = selected?.startsWith(`${node.path}/`) === true || expanded[node.path] === true;
            return _jsxs("details", { className: "oh-story-file-folder", open: open, onToggle: (event) => { onToggle(node.path, event.currentTarget.open); }, children: [_jsxs("summary", { style: { '--oh-story-indent': `${String(depth * 14)}px` }, title: node.path, children: [node.name, _jsx("span", { children: node.fileCount })] }), _jsx(FileTreeNodes, { nodes: node.children, depth: depth + 1, expanded: expanded, selected: selected, activityPath: activityPath, onToggle: onToggle, onSelect: onSelect })] }, node.path);
        }) });
}
function useWorkspace(sessionId) {
    const [version, setVersion] = useState(0);
    const [workspace, setWorkspace] = useState();
    const [error, setError] = useState();
    const [loading, setLoading] = useState(true);
    const reload = useCallback(() => {
        setLoading(true);
        setVersion(value => value + 1);
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        setError(undefined);
        void fetch(endpoint('workspace', sessionId), { signal: controller.signal })
            .then(response => json(response))
            .then(setWorkspace)
            .catch((reason) => {
            if (!controller.signal.aborted)
                setError(reason instanceof Error ? reason.message : String(reason));
        })
            .finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => { controller.abort(); };
    }, [sessionId, version]);
    return { workspace, error, loading, reload };
}
function CreativeWorkbench({ sessionId, runningCalls, partial, settledMutation, sessionRunning, productionQueue, productionIntents, sendProductionPrompt, cancelProduction, removeQueuedProduction, useStore, actions, }) {
    const { workspace, error, loading: workspaceLoading, reload } = useWorkspace(sessionId);
    const activities = useMemo(() => fileMutations(runningCalls, partial), [partial, runningCalls]);
    const normalizedActivities = useMemo(() => activities.flatMap((activity) => {
        const path = creativeRelativePath(activity.path, workspace?.cwd);
        return path === undefined ? [] : [{ activity, path }];
    }), [activities, workspace?.cwd]);
    const primaryActivity = normalizedActivities.at(-1);
    const activityPaths = useMemo(() => new Set(normalizedActivities.map(value => value.path)), [normalizedActivities]);
    const activity = primaryActivity?.activity;
    const activityPath = primaryActivity?.path;
    const workbench = useStore(memory => memory.workbench);
    const setWorkbench = actions.setWorkbench;
    const initializedWorkbench = useRef(false);
    const storedSelected = useStore(memory => memory.selected);
    // Session-scoped stores can revive a previously absent optional value as an
    // empty object when crossing the host/client snapshot boundary.  Never pass
    // that transport sentinel into React as text or a DOM attribute.
    const selected = typeof storedSelected === 'string' ? storedSelected : undefined;
    const setSelected = actions.setSelected;
    const buffers = useStore(memory => memory.buffers);
    const setBuffers = actions.setBuffers;
    const buffersRef = useRef({});
    const expanded = useStore(memory => memory.expanded);
    const setExpanded = actions.setExpanded;
    const productionSection = useStore(memory => memory.productionSection);
    const setProductionSection = actions.setProductionSection;
    const productionSelectedIds = useStore(memory => memory.productionSelectedIds);
    const productionJobsByEpisode = useStore(memory => memory.productionJobs);
    const productionSelectionsByEpisode = useStore(memory => memory.productionSelections);
    const productionReferencesByEpisode = useStore(memory => memory.productionReferences);
    const productionSequenceByEpisode = useStore(memory => memory.productionSequence);
    const productionCanvasByEpisode = useStore(memory => memory.productionCanvas);
    const productionZoomByEpisode = useStore(memory => memory.productionZoom);
    const productionIntentCalls = useStore(memory => memory.productionIntentCalls);
    const surfaceRef = useRef(null);
    const navRef = useRef(null);
    const activityBases = useRef(new Map());
    const previousSignals = useRef(new Set());
    const previousSettledMutation = useRef(settledMutation);
    const saveLocks = useRef(new Set());
    const buffer = selected === undefined ? undefined : buffers[selected];
    const selectedFile = workspace?.files.find(file => file.path === selected);
    const selectedMedia = selectedFile?.kind === 'media';
    const dirty = buffer?.source === 'human' && buffer.content !== buffer.saved;
    const saving = buffer?.saving === true;
    const fileError = buffer?.error;
    const conflict = buffer?.conflict;
    const selectedLower = selected?.toLocaleLowerCase();
    const markdown = selectedLower?.endsWith('.md') === true;
    const jsonl = selectedLower?.endsWith('.jsonl') === true;
    const structured = jsonl || selectedLower?.endsWith('.json') === true;
    const previewable = markdown || jsonl;
    const episodeDirectory = episodeDirectoryForPath(selected);
    const productionAvailable = selected !== undefined && isCreatorDocumentPath(selected) && episodeDirectory !== undefined;
    const editorModes = productionAvailable ? EDITOR_MODES : EDITOR_MODES.filter(mode => mode !== 'production');
    const episodeDocumentPaths = useMemo(() => episodeDirectory === undefined ? [] : creatorDocumentPaths(workspace?.files.filter(file => file.kind === 'text') ?? [], episodeDirectory), [episodeDirectory, workspace?.files]);
    const episodeDocuments = useMemo(() => Object.fromEntries(episodeDocumentPaths.flatMap((path) => {
        const current = buffers[path];
        return current === undefined || current.missing === true ? [] : [[path, current.content]];
    })), [buffers, episodeDocumentPaths]);
    const episodeProduction = useMemo(() => episodeDirectory === undefined ? undefined : parseEpisodeProduction(episodeDocuments, episodeDirectory), [episodeDirectory, episodeDocuments]);
    const productionLibrary = useMemo(() => (workspace?.files ?? []).flatMap((file) => {
        if (file.kind !== 'media' || file.mimeType?.startsWith('audio/') === true)
            return [];
        if (!file.path.startsWith('剧集/') && !file.path.startsWith('交付/'))
            return [];
        const targetId = file.path.toLocaleUpperCase().match(/(?:SHOT|IMG|MOTION|VISUAL)-[A-Z0-9-]+/u)?.[0] ?? file.path.split('/').at(-2) ?? 'PROJECT-MEDIA';
        return [{
                id: `workspace:${file.path}:${file.version}`,
                targetId,
                kind: file.mimeType?.startsWith('image/') === true ? 'image' : 'video',
                url: endpoint('media', sessionId, file.path),
                path: file.path,
            }];
    }), [sessionId, workspace?.files]);
    const productionVersions = useMemo(() => {
        if (episodeProduction === undefined)
            return [];
        const episodeName = episodeProduction.episodeDirectory.split('/').at(-1) ?? '';
        const knownTargets = [
            ...episodeProduction.shots.map(shot => shot.id),
            ...episodeProduction.assets.map(asset => asset.id),
            ...episodeProduction.visualAssets.map(asset => asset.id),
            ...episodeProduction.motions.map(motion => motion.id),
        ].sort((left, right) => right.length - left.length);
        const motionTargets = new Map(episodeProduction.motions.flatMap(motion => motion.shotId === undefined ? [] : [[motion.id, motion.shotId]]));
        const fromWorkspace = productionLibrary.flatMap((version) => {
            if (version.path === undefined || (!version.path.startsWith(`${episodeProduction.episodeDirectory}/`) && !version.path.startsWith(`交付/${episodeName}/`)))
                return [];
            const matched = mediaTargetFromPath(version.path, knownTargets);
            const composition = /(?:^|\/)成片-[^/]+\.mp4$/iu.test(version.path);
            if (matched === undefined && !composition)
                return [];
            const targetId = matched === undefined ? episodeProduction.episodeDirectory : motionTargets.get(matched) ?? matched;
            return [{ ...version, targetId }];
        });
        const byId = new Map();
        for (const version of fromWorkspace)
            byId.set(version.id, version);
        return [...byId.values()];
    }, [episodeProduction, productionLibrary]);
    const productionSelectedId = episodeDirectory === undefined ? undefined : productionSelectedIds[episodeDirectory];
    const productionJobs = episodeDirectory === undefined ? [] : productionJobsByEpisode[episodeDirectory] ?? [];
    const productionSelections = episodeDirectory === undefined ? {} : productionSelectionsByEpisode[episodeDirectory] ?? {};
    const productionReferences = episodeDirectory === undefined ? {} : productionReferencesByEpisode[episodeDirectory] ?? {};
    const productionSequence = episodeDirectory === undefined ? [] : productionSequenceByEpisode[episodeDirectory] ?? [];
    const productionCanvas = episodeDirectory === undefined ? {} : productionCanvasByEpisode[episodeDirectory] ?? {};
    const productionZoom = episodeDirectory === undefined ? .65 : productionZoomByEpisode[episodeDirectory] ?? .65;
    const setProductionSelectedId = useCallback((selectedId) => {
        if (episodeDirectory !== undefined)
            actions.setProductionSelectedIds(current => ({ ...current, [episodeDirectory]: selectedId }));
    }, [actions, episodeDirectory]);
    const setProductionJobs = useCallback((jobs) => {
        if (episodeDirectory !== undefined)
            actions.setProductionJobs(current => ({ ...current, [episodeDirectory]: jobs }));
    }, [actions, episodeDirectory]);
    const setProductionSelections = useCallback((selections) => {
        if (episodeDirectory !== undefined)
            actions.setProductionSelections(current => ({ ...current, [episodeDirectory]: selections }));
    }, [actions, episodeDirectory]);
    const setProductionReferences = useCallback((references) => {
        if (episodeDirectory !== undefined)
            actions.setProductionReferences(current => ({ ...current, [episodeDirectory]: references }));
    }, [actions, episodeDirectory]);
    const setProductionSequence = useCallback((sequence) => {
        if (episodeDirectory !== undefined)
            actions.setProductionSequence(current => ({ ...current, [episodeDirectory]: sequence }));
    }, [actions, episodeDirectory]);
    const setProductionCanvas = useCallback((canvas) => {
        if (episodeDirectory !== undefined)
            actions.setProductionCanvas(current => ({ ...current, [episodeDirectory]: canvas }));
    }, [actions, episodeDirectory]);
    const setProductionZoom = useCallback((zoom) => {
        if (episodeDirectory !== undefined)
            actions.setProductionZoom(current => ({ ...current, [episodeDirectory]: zoom }));
    }, [actions, episodeDirectory]);
    const editorMode = useStore(memory => memory.editorMode);
    const setEditorMode = actions.setEditorMode;
    const modeSelection = useRef(selected);
    const textareaRef = useRef(null);
    const editorPositions = useRef(new Map());
    const editorReady = buffer !== undefined && buffer.missing !== true;
    const availableModes = useMemo(() => {
        const value = new Set();
        for (const file of workspace?.files ?? []) {
            const mode = workbenchModeForPath(file.path);
            if (mode !== undefined)
                value.add(mode);
        }
        if (value.size === 0)
            value.add('story');
        return WORKBENCH_MODES.filter(mode => value.has(mode));
    }, [workspace?.files]);
    const showModeTabs = workspace !== undefined && availableModes.length > 1;
    const workspaceKind = workbench;
    useEffect(() => { buffersRef.current = buffers; }, [buffers]);
    const rememberEditorPosition = useCallback(() => {
        const element = textareaRef.current;
        if (element === null || selected === undefined || element.getAttribute('aria-label') !== selected)
            return;
        editorPositions.current.set(selected, {
            scrollTop: element.scrollTop,
            selectionStart: element.selectionStart,
            selectionEnd: element.selectionEnd,
        });
    }, [selected]);
    useLayoutEffect(() => {
        if (editorMode !== 'source' || selected === undefined || !editorReady)
            return;
        const element = textareaRef.current;
        const position = editorPositions.current.get(selected);
        if (element === null || position === undefined)
            return;
        const end = Math.min(position.selectionEnd, element.value.length);
        element.setSelectionRange(Math.min(position.selectionStart, end), end);
        element.scrollTop = position.scrollTop;
    }, [editorMode, editorReady, selected]);
    useEffect(() => {
        const warn = (event) => {
            if (!Object.values(buffersRef.current).some(value => value.source === 'human' && value.content !== value.saved))
                return;
            event.preventDefault();
        };
        globalThis.addEventListener('beforeunload', warn);
        return () => { globalThis.removeEventListener('beforeunload', warn); };
    }, []);
    const expandPath = useCallback((path) => {
        const segments = path.split('/');
        const ancestors = [groupForPath(path)];
        for (let index = 1; index < segments.length - 1; index += 1)
            ancestors.push(segments.slice(0, index + 1).join('/'));
        setExpanded((current) => {
            const next = { ...current };
            for (const ancestor of ancestors)
                next[ancestor] = true;
            return next;
        });
    }, []);
    const revealPath = useCallback((path) => {
        rememberEditorPosition();
        const nextWorkbench = workbenchModeForPath(path) ?? 'story';
        setWorkbench(nextWorkbench);
        setSelected(path);
        expandPath(path);
    }, [expandPath, rememberEditorPosition]);
    useEffect(() => {
        if (workspace === undefined)
            return;
        const pending = productionIntents.filter(({ callId }) => productionIntentCalls[callId] !== true);
        if (pending.length === 0)
            return;
        for (const { intent } of pending) {
            if (intent.action === 'open_section' || intent.action === 'focus_target') {
                const documentPath = ['分镜.md', '图片提示词.md', '视觉设定.md', '剧本.md', '视频提示词.md']
                    .map(name => `${intent.episode}/${name}`)
                    .find(path => workspace.files.some(file => file.path === path));
                if (documentPath !== undefined) {
                    setWorkbench('drama');
                    setSelected(documentPath);
                    expandPath(documentPath);
                    globalThis.setTimeout(() => { setEditorMode('production'); }, 0);
                }
            }
            if (intent.action === 'open_section')
                setProductionSection(intent.section ?? 'shots');
            else if (intent.action === 'focus_target') {
                actions.setProductionSelectedIds(current => ({ ...current, [intent.episode]: intent.targetId }));
                setProductionSection(intent.section ?? (intent.targetId?.startsWith('SHOT-') === true ? 'shots' : 'assets'));
            }
            else if (intent.action === 'set_sequence') {
                actions.setProductionSequence(current => ({
                    ...current,
                    [intent.episode]: (intent.shotIds ?? []).map(shotId => ({ shotId })),
                }));
            }
            else if (intent.action === 'track_job' && intent.jobId !== undefined && intent.targetId !== undefined && intent.jobKind !== undefined) {
                const { jobId, targetId, jobKind } = intent;
                actions.setProductionJobs((current) => {
                    const jobs = current[intent.episode] ?? [];
                    if (jobs.some(job => job.id === jobId)) {
                        return {
                            ...current,
                            [intent.episode]: jobs.map(job => job.id === jobId ? {
                                ...job,
                                targetId,
                                kind: jobKind,
                                status: 'running',
                                progress: Math.max(10, job.progress),
                                prompt: intent.prompt ?? job.prompt,
                                expectedOutputs: intent.expectedOutputs ?? job.expectedOutputs,
                                error: undefined,
                            } : job),
                        };
                    }
                    return {
                        ...current,
                        [intent.episode]: [...jobs, {
                                ...createPendingJob({
                                    id: jobId,
                                    targetId,
                                    kind: jobKind,
                                    prompt: intent.prompt ?? '',
                                    expectedOutputs: intent.expectedOutputs,
                                }),
                                status: 'running',
                                progress: 10,
                            }],
                    };
                });
            }
        }
        actions.setProductionIntentCalls(current => ({
            ...current,
            ...Object.fromEntries(pending.map(({ callId }) => [callId, true])),
        }));
    }, [actions, expandPath, productionIntentCalls, productionIntents, setEditorMode, setProductionSection, setSelected, setWorkbench, workspace]);
    const followAgentPath = useCallback((path) => {
        expandPath(path);
        const current = selected === undefined ? undefined : buffersRef.current[selected];
        const preserveFocusedDraft = path !== selected
            && current?.source === 'human'
            && current.content !== current.saved
            && surfaceRef.current?.ownerDocument.activeElement === textareaRef.current;
        if (preserveFocusedDraft)
            return;
        revealPath(path);
    }, [expandPath, revealPath, selected]);
    useEffect(() => {
        if (workspace === undefined || initializedWorkbench.current)
            return;
        if (!availableModes.includes(workbench)) {
            setWorkbench(availableModes[0] ?? 'story');
        }
        initializedWorkbench.current = true;
    }, [availableModes, workbench, workspace]);
    useEffect(() => {
        if (activityPath !== undefined && activityPath === selected && !selectedMedia)
            setEditorMode('source');
    }, [activityPath, selected, selectedMedia]);
    useEffect(() => {
        if (modeSelection.current === selected)
            return;
        modeSelection.current = selected;
        setEditorMode(selected !== undefined && activityPaths.has(selected) ? 'source' : selectedMedia || previewable ? 'preview' : 'source');
    }, [activityPaths, previewable, selected, selectedMedia]);
    useEffect(() => {
        if (workspaceLoading)
            return;
        if (activityPath !== undefined)
            return;
        if (selected !== undefined && ((workspace?.files.some(file => file.path === selected) ?? false)
            || buffers[selected] !== undefined) && workbenchModeForPath(selected) === workbench)
            return;
        setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench));
    }, [activityPath, buffers, selected, workbench, workspace, workspaceLoading]);
    useEffect(() => {
        if (workspace === undefined || workspaceLoading)
            return;
        const paths = new Set(workspace.files.map(file => file.path));
        setBuffers((current) => {
            let changed = false;
            const next = { ...current };
            for (const [path, value] of Object.entries(current)) {
                if (paths.has(path) || activityPaths.has(path))
                    continue;
                if (value.source === 'human' && value.content !== value.saved) {
                    if (value.missing !== true) {
                        next[path] = { ...value, missing: true, error: '文件已从 workspace 移除。本地草稿仍保留，可复制后放弃草稿。' };
                        changed = true;
                    }
                }
                else {
                    delete next[path];
                    changed = true;
                }
            }
            return changed ? next : current;
        });
    }, [activityPaths, workspace, workspaceLoading]);
    useEffect(() => {
        if (selected === undefined || selectedMedia || activityPaths.has(selected))
            return;
        if (!(workspace?.files.some(file => file.path === selected) ?? false))
            return;
        const controller = new AbortController();
        setBuffers((current) => {
            const existing = current[selected];
            return existing === undefined ? current : { ...current, [selected]: { ...existing, error: undefined } };
        });
        void fetch(endpoint('file', sessionId, selected), { signal: controller.signal })
            .then(response => json(response))
            .then((file) => {
            setBuffers((current) => {
                const existing = current[file.path];
                if (existing?.source === 'human' && existing.content !== existing.saved) {
                    if (existing.version === file.version)
                        return { ...current, [file.path]: { ...existing, missing: false, error: undefined } };
                    return {
                        ...current,
                        [file.path]: {
                            ...existing,
                            missing: false,
                            error: undefined,
                            conflict: {
                                message: `${file.path} 已在磁盘上更新；你的本地草稿没有被覆盖。`,
                                theirs: file.content,
                                theirsVersion: file.version,
                            },
                        },
                    };
                }
                return {
                    ...current,
                    [file.path]: { content: file.content, saved: file.content, source: 'disk', version: file.version },
                };
            });
        })
            .catch((reason) => {
            if (controller.signal.aborted)
                return;
            setBuffers((current) => {
                const existing = current[selected];
                return existing === undefined ? current : {
                    ...current,
                    [selected]: { ...existing, error: reason instanceof Error ? reason.message : String(reason) },
                };
            });
        });
        return () => { controller.abort(); };
    }, [activityPaths, selected, selectedMedia, sessionId, workspace?.files]);
    useEffect(() => {
        if (!productionAvailable)
            return;
        const missing = episodeDocumentPaths.filter(path => buffersRef.current[path] === undefined && !activityPaths.has(path));
        if (missing.length === 0)
            return;
        const controller = new AbortController();
        void Promise.all(missing.map(path => fetch(endpoint('file', sessionId, path), { signal: controller.signal }).then(response => json(response))))
            .then((files) => {
            setBuffers((current) => {
                const next = { ...current };
                for (const file of files) {
                    const existing = next[file.path];
                    if (existing?.source === 'human' && existing.content !== existing.saved)
                        continue;
                    next[file.path] = { content: file.content, saved: file.content, source: 'disk', version: file.version };
                }
                return next;
            });
        })
            .catch((reason) => {
            if (!controller.signal.aborted) {
                setBuffers((current) => {
                    const next = { ...current };
                    for (const path of missing) {
                        const existing = next[path];
                        if (existing !== undefined)
                            next[path] = { ...existing, error: reason instanceof Error ? reason.message : String(reason) };
                    }
                    return next;
                });
            }
        });
        return () => { controller.abort(); };
    }, [activityPaths, episodeDocumentPaths, productionAvailable, sessionId]);
    useEffect(() => {
        if (normalizedActivities.length === 0)
            return;
        for (const { path } of normalizedActivities)
            expandPath(path);
        if (activityPath !== undefined)
            followAgentPath(activityPath);
        setBuffers((current) => {
            let next = current;
            for (const { activity: currentActivity, path } of normalizedActivities) {
                const existing = next[path];
                if (existing?.source === 'human' && existing.content !== existing.saved) {
                    next = {
                        ...next,
                        [path]: {
                            ...existing,
                            conflict: { message: `${path} 正由 Agent 修改；你的本地草稿已锁定，不会被覆盖。` },
                        },
                    };
                    continue;
                }
                let basis = activityBases.current.get(currentActivity.callId);
                if (basis === undefined || basis.path !== path) {
                    basis = { path, base: existing?.content ?? '' };
                    activityBases.current.set(currentActivity.callId, basis);
                }
                const preview = previewMutation(currentActivity, basis.base);
                if (preview === undefined || (existing?.source === 'agent' && existing.content === preview))
                    continue;
                next = {
                    ...next,
                    [path]: {
                        content: preview,
                        saved: existing?.saved ?? '',
                        source: 'agent',
                        version: existing?.version ?? '',
                    },
                };
            }
            return next;
        });
    }, [activityPath, expandPath, followAgentPath, normalizedActivities]);
    useEffect(() => {
        const signals = new Set(mutatingCallIds(runningCalls));
        for (const { activity: currentActivity } of normalizedActivities)
            signals.add(currentActivity.callId.split(':', 1)[0] ?? currentActivity.callId);
        const settled = [...previousSignals.current].some(callId => !signals.has(callId));
        for (const callId of activityBases.current.keys()) {
            if (!signals.has(callId.split(':', 1)[0] ?? callId))
                activityBases.current.delete(callId);
        }
        previousSignals.current = signals;
        if (!settled)
            return;
        reload();
    }, [normalizedActivities, reload, runningCalls]);
    useEffect(() => {
        if (settledMutation === undefined || settledMutation === previousSettledMutation.current)
            return;
        // The signal carries an absolute path, so creativeRelativePath cannot resolve it until the
        // workspace (and its cwd) has loaded. Consuming the signal first would burn it: the effect
        // re-runs when cwd arrives, but the guard above then short-circuits and the agent's file is
        // never selected. Wait for cwd instead of dropping the follow.
        if (workspace?.cwd === undefined)
            return;
        previousSettledMutation.current = settledMutation;
        const path = creativeRelativePath(settledMutation.slice(settledMutation.indexOf('\0') + 1), workspace.cwd);
        if (path !== undefined)
            followAgentPath(path);
        reload();
    }, [followAgentPath, reload, settledMutation, workspace?.cwd]);
    useEffect(() => {
        if (selected === undefined)
            return;
        for (const button of navRef.current?.querySelectorAll('button[data-file-path]') ?? []) {
            if (button.dataset.filePath === selected) {
                button.scrollIntoView({ block: 'nearest' });
                break;
            }
        }
    }, [selected]);
    useEffect(() => {
        if (normalizedActivities.length > 0 || workspace === undefined)
            return;
        const sessionSurface = surfaceRef.current?.parentElement;
        if (sessionSurface === undefined || sessionSurface === null)
            return;
        const knownPaths = new Set(workspace.files.map(file => file.path));
        const followOfficialFileLink = (event) => {
            const origin = event.target;
            if (!(origin instanceof Element))
                return;
            const control = origin.closest('button, a');
            if (control === null || control.closest('.oh-story-split-surface') !== null)
                return;
            const candidates = [control.title, control.getAttribute('aria-label'), control.textContent];
            for (const candidate of candidates) {
                const path = creativeRelativePath(candidate?.trim().replace(/^(?:Open|打开)\s+/u, ''), workspace.cwd);
                if (path === undefined || !knownPaths.has(path))
                    continue;
                event.preventDefault();
                event.stopPropagation();
                revealPath(path);
                break;
            }
        };
        sessionSurface.addEventListener('click', followOfficialFileLink, true);
        return () => { sessionSurface.removeEventListener('click', followOfficialFileLink, true); };
    }, [normalizedActivities.length, revealPath, workspace]);
    const savePath = useCallback(async (path) => {
        if (saveLocks.current.has(path))
            return;
        const submitted = buffersRef.current[path];
        if (submitted === undefined || submitted.missing === true || submitted.content === submitted.saved)
            return;
        saveLocks.current.add(path);
        setBuffers((current) => {
            const existing = current[path];
            return existing === undefined ? current : { ...current, [path]: { ...existing, saving: true, error: undefined } };
        });
        try {
            const file = await json(await fetch(endpoint('file', sessionId, path), {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ content: submitted.content, baseVersion: submitted.version }),
            }));
            setBuffers((current) => {
                const latest = current[path];
                if (latest === undefined)
                    return current;
                const unchanged = latest.content === submitted.content;
                return {
                    ...current,
                    [path]: {
                        content: unchanged ? file.content : latest.content,
                        saved: file.content,
                        source: unchanged ? 'disk' : 'human',
                        version: file.version,
                        saving: false,
                    },
                };
            });
            reload();
        }
        catch (reason) {
            if (reason instanceof WorkspaceRequestError && reason.status === 412) {
                try {
                    const theirs = await json(await fetch(endpoint('file', sessionId, path)));
                    setBuffers((current) => {
                        const latest = current[path];
                        if (latest === undefined)
                            return current;
                        return {
                            ...current,
                            [path]: {
                                ...latest,
                                saving: false,
                                conflict: {
                                    message: `${path} 已在磁盘上更新；请选择保留哪一版。`,
                                    theirs: theirs.content,
                                    theirsVersion: theirs.version,
                                },
                            },
                        };
                    });
                }
                catch (refreshError) {
                    setBuffers((current) => {
                        const existing = current[path];
                        return existing === undefined ? current : {
                            ...current,
                            [path]: { ...existing, saving: false, error: refreshError instanceof Error ? refreshError.message : String(refreshError) },
                        };
                    });
                }
            }
            else {
                setBuffers((current) => {
                    const existing = current[path];
                    return existing === undefined ? current : {
                        ...current,
                        [path]: { ...existing, saving: false, error: reason instanceof Error ? reason.message : String(reason) },
                    };
                });
            }
        }
        finally {
            saveLocks.current.delete(path);
        }
    }, [reload, sessionId]);
    useEffect(() => {
        const saveShortcut = (event) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== 's')
                return;
            event.preventDefault();
            if (selected !== undefined)
                void savePath(selected);
        };
        globalThis.addEventListener('keydown', saveShortcut);
        return () => { globalThis.removeEventListener('keydown', saveShortcut); };
    }, [savePath, selected]);
    const groups = useMemo(() => {
        const value = new Map();
        const all = [...(workspace?.files ?? [])].filter(file => workbenchModeForPath(file.path) === workbench);
        if (activityPath !== undefined && !all.some(file => file.path === activityPath))
            all.push({ path: activityPath, bytes: 0, version: '', kind: 'text' });
        all.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));
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
            return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex)
                || left.localeCompare(right, 'zh-Hans-CN');
        });
    }, [activityPath, workbench, workspace]);
    const selectWorkbench = (next) => {
        setWorkbench(next);
        const target = workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, next);
        if (target === undefined)
            setSelected(undefined);
        else
            revealPath(target);
    };
    const selectEditorMode = (next) => {
        if (next === 'preview')
            rememberEditorPosition();
        setEditorMode(next);
    };
    const navigateProductionTarget = (target) => {
        const content = buffersRef.current[target.path]?.content ?? '';
        const before = content.slice(0, target.offset);
        const approximateScrollTop = Math.max(0, before.split(/\r?\n/u).length * 28 - 96);
        editorPositions.current.set(target.path, { scrollTop: approximateScrollTop, selectionStart: target.offset, selectionEnd: target.offset });
        modeSelection.current = target.path;
        revealPath(target.path);
        setEditorMode('source');
    };
    const selectedLabel = selected ?? `在当前 DSH workspace 中选择${workbench === 'story' ? '小说' : '短剧'}文件`;
    const selectedBasename = selected?.split('/').at(-1) ?? selectedLabel;
    const selectedGroup = selected === undefined ? undefined : groupForPath(selected);
    console.info('[oh-story-debug]', JSON.stringify({ storedSelected, selected, workbench, editorMode, workspace: workspace === undefined ? 'missing' : { files: workspace.files.length, metadataErrors: workspace.metadataErrors } }));
    const toggleGroup = (key, open) => {
        setExpanded(current => ({ ...current, [key]: open }));
    };
    const resolveConflict = (keepLocal) => {
        if (selected === undefined || conflict?.theirs === undefined || conflict.theirsVersion === undefined)
            return;
        const theirs = conflict.theirs;
        const theirsVersion = conflict.theirsVersion;
        setBuffers((current) => {
            const existing = current[selected];
            if (existing === undefined)
                return current;
            return {
                ...current,
                [selected]: keepLocal
                    ? { ...existing, saved: theirs, version: theirsVersion, source: 'human', conflict: undefined }
                    : { content: theirs, saved: theirs, source: 'disk', version: theirsVersion },
            };
        });
    };
    return _jsxs("div", { ref: surfaceRef, className: "oh-story-split-surface", "data-workbench": workbench, children: [_jsx("style", { children: styles }), _jsxs(_Fragment, { children: [_jsxs("aside", { className: "oh-story-tree", children: [_jsxs("div", { className: "oh-story-brand", children: [_jsxs("span", { className: "oh-story-brand-cluster", children: [_jsxs("strong", { children: ["\u2726 ", _jsx("span", { children: "Oh Story" })] }), workspaceKind !== undefined && _jsx("span", { className: "oh-story-kind", children: workspaceKind === 'story' ? '小说' : '短剧' })] }), _jsx("button", { type: "button", onClick: reload, title: "\u5237\u65B0", "aria-label": "\u5237\u65B0\u9879\u76EE\u6587\u4EF6", children: "\u21BB" })] }), showModeTabs && _jsx("div", { className: "oh-story-mode-tabs", role: "tablist", "aria-label": "\u521B\u4F5C\u5DE5\u4F5C\u53F0", children: availableModes.map(mode => _jsx("button", { type: "button", role: "tab", tabIndex: workbench === mode ? 0 : -1, "aria-selected": workbench === mode, onKeyDown: (event) => { handleTabKey(event, availableModes, workbench, selectWorkbench); }, onClick: () => { selectWorkbench(mode); }, children: mode === 'story' ? '小说' : mode === 'drama' ? '短剧' : '游戏' }, mode)) }), error !== undefined && _jsx("div", { className: "oh-story-error", children: error }), workspace?.metadataErrors.map(message => _jsx("div", { className: "oh-story-warning", children: message }, message)), _jsx("nav", { ref: navRef, "aria-label": workbench === 'story' ? '小说项目文件' : '短剧项目文件', children: groups.map(([directory, files]) => {
                                    const groupOpen = selectedGroup === directory || expanded[directory] === true;
                                    return _jsxs("details", { className: "oh-story-file-group", open: groupOpen, onToggle: (event) => { toggleGroup(directory, event.currentTarget.open); }, children: [_jsxs("summary", { children: [directory, _jsx("span", { children: files.length })] }), _jsx(FileTreeNodes, { nodes: buildFileTree(files, directory), depth: 1, expanded: expanded, selected: selected, activityPath: activityPath, onToggle: toggleGroup, onSelect: revealPath })] }, directory);
                                }) })] }), _jsxs("main", { className: "oh-story-editor", children: [_jsxs("header", { children: [_jsxs("span", { className: "oh-story-editor-path", title: selected, children: [_jsx("span", { children: selectedLabel }), _jsx("strong", { children: selectedBasename })] }), _jsxs("div", { className: "oh-story-editor-actions", children: [(previewable || productionAvailable) && !selectedMedia && _jsx("div", { className: "oh-story-editor-tabs", role: "tablist", "aria-label": productionAvailable ? '短剧文档查看方式' : markdown ? 'Markdown 查看方式' : 'JSONL 查看方式', children: editorModes.map(mode => _jsx("button", { type: "button", role: "tab", tabIndex: editorMode === mode ? 0 : -1, "aria-selected": editorMode === mode, onKeyDown: (event) => { handleTabKey(event, editorModes, editorMode, selectEditorMode); }, onClick: () => { selectEditorMode(mode); }, children: mode === 'preview' ? '预览' : mode === 'source' ? '源码' : '生产' }, mode)) }), (dirty || saving) && selected !== undefined && _jsx("button", { className: "oh-story-save", type: "button", disabled: saving || buffer?.missing === true, onClick: () => { void savePath(selected); }, children: saving ? '保存中…' : '保存' })] })] }), activity !== undefined && activityPath !== undefined && activityPath === selected && _jsxs("div", { className: "oh-story-stream", "data-stage": activity.stage, role: "status", "aria-live": "polite", children: ["\u25CF ", activity.stage === 'running' ? 'Agent 正在应用修改' : 'Agent 正在生成文件内容'] }), conflict !== undefined && _jsxs("div", { className: "oh-story-conflict", role: "alert", children: [_jsx("span", { children: conflict.message }), conflict.theirs !== undefined && conflict.theirsVersion !== undefined && selected !== undefined && _jsxs("div", { children: [_jsx("button", { type: "button", onClick: () => { resolveConflict(false); }, children: "\u8F7D\u5165\u78C1\u76D8\u7248\u672C" }), _jsx("button", { type: "button", onClick: () => { resolveConflict(true); }, children: "\u4FDD\u7559\u672C\u5730\u8349\u7A3F" })] })] }), fileError !== undefined && _jsx("div", { className: "oh-story-error", children: fileError }), selected === undefined
                                ? _jsx("div", { className: "oh-story-empty", children: workbench === 'story'
                                        ? _jsxs(_Fragment, { children: ["\u5F53\u524D workspace \u8FD8\u6CA1\u6709\u5C0F\u8BF4\u6587\u4EF6\u3002\u53EF\u5728\u53F3\u4FA7 Chat \u4E2D\u8FD0\u884C ", _jsx("code", { children: "/story-setup" }), "\u3002"] })
                                        : _jsxs(_Fragment, { children: ["\u5F53\u524D workspace \u8FD8\u6CA1\u6709\u77ED\u5267\u9879\u76EE\u3002\u53EF\u5728\u53F3\u4FA7 Chat \u4E2D\u8FD0\u884C ", _jsx("code", { children: "/short-drama" }), "\u3002"] }) })
                                : selectedMedia && selectedFile !== undefined
                                    ? _jsx("div", { className: "oh-story-media-document", children: selectedFile.mimeType?.startsWith('image/') === true
                                            ? _jsx("img", { src: endpoint('media', sessionId, selectedFile.path), alt: selectedFile.path })
                                            : selectedFile.mimeType?.startsWith('audio/') === true
                                                ? _jsx("audio", { src: endpoint('media', sessionId, selectedFile.path), controls: true })
                                                : _jsx("video", { src: endpoint('media', sessionId, selectedFile.path), controls: true, preload: "metadata" }) })
                                    : buffer === undefined
                                        ? _jsxs("div", { className: "oh-story-empty", children: ["\u6B63\u5728\u52A0\u8F7D ", selected, "\u2026"] })
                                        : buffer.missing === true
                                            ? _jsxs("div", { className: "oh-story-empty", children: ["\u6587\u4EF6\u5DF2\u4ECE workspace \u79FB\u9664\uFF0C\u672C\u5730\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002\u8BF7\u5148\u590D\u5236\u9700\u8981\u7684\u5185\u5BB9\uFF0C\u518D\u653E\u5F03\u8349\u7A3F\u3002", _jsx("button", { type: "button", onClick: () => {
                                                            setBuffers((current) => {
                                                                const next = { ...current };
                                                                delete next[selected];
                                                                return next;
                                                            });
                                                            setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench));
                                                        }, children: "\u653E\u5F03\u672C\u5730\u8349\u7A3F" })] })
                                            : editorMode === 'production' && productionAvailable && episodeProduction !== undefined
                                                ? _jsx(CanvasDocument, { sessionId: sessionId, production: episodeProduction, sessionRunning: sessionRunning, queue: productionQueue, section: productionSection, selectedId: productionSelectedId, jobs: productionJobs, versions: productionVersions, libraryVersions: productionLibrary, selections: productionSelections, manualReferences: productionReferences, sequence: productionSequence, canvas: productionCanvas, zoom: productionZoom, onSectionChange: setProductionSection, onSelect: setProductionSelectedId, onNavigate: navigateProductionTarget, onJobsChange: setProductionJobs, onSelectionsChange: setProductionSelections, onManualReferencesChange: setProductionReferences, onOpenMedia: (path) => { revealPath(path); }, onSequenceChange: setProductionSequence, onCanvasChange: setProductionCanvas, onZoomChange: setProductionZoom, onDispatchPrompt: sendProductionPrompt, onCancelTurn: cancelProduction, onRemoveQueued: removeQueuedProduction, onRefresh: reload }, `${sessionId}:${episodeProduction.episodeDirectory}`)
                                                : previewable && editorMode === 'preview'
                                                    ? markdown
                                                        ? _jsx(MarkdownPreview, { content: buffer.content, label: selected })
                                                        : _jsx(JsonlPreview, { content: buffer.content, label: selected })
                                                    : _jsx("textarea", { ref: textareaRef, value: buffer.content, "data-format": structured ? 'structured' : 'prose', onBlur: rememberEditorPosition, onScroll: rememberEditorPosition, onSelect: rememberEditorPosition, onChange: (event) => {
                                                            const content = event.target.value;
                                                            setBuffers(current => ({
                                                                ...current,
                                                                [selected]: {
                                                                    content,
                                                                    saved: current[selected]?.saved ?? '',
                                                                    source: 'human',
                                                                    version: current[selected]?.version ?? '',
                                                                    conflict: current[selected]?.conflict,
                                                                    saving: current[selected]?.saving,
                                                                }
                                                            }));
                                                        }, spellCheck: !structured, "aria-label": selected })] })] })] });
}
/** Mount beside the official conversation without replacing Chat or Composer. */
function CreativeSplitBridge({ sessionId, useSession, useChat, useStore, actions, sendProductionPrompt, cancelProduction, removeQueuedProduction }) {
    const marker = useRef(null);
    const [target, setTarget] = useState();
    const runningCalls = useChat(snapshot => snapshot.legacy.runningCalls);
    const partial = useChat(snapshot => streamingAssistant(snapshot.timeline));
    const settledMutation = useChat(latestSettledMutation);
    const workbench = useStore(memory => memory.workbench);
    const sessionRunning = useSession(snapshot => snapshot.running);
    const productionQueue = useSession(snapshot => snapshot.queue.map(item => ({ id: item.id, preview: item.preview })));
    const chat = useChat(snapshot => snapshot);
    const productionIntents = useMemo(() => settledProductionIntents(chat), [chat]);
    useLayoutEffect(() => {
        const document = marker.current?.ownerDocument;
        if (document === undefined)
            return;
        const locate = () => {
            const anchor = document.querySelector("[data-conversation-scroll] > [data-slot='conversation.session']");
            setTarget(current => current === anchor ? current : anchor ?? undefined);
        };
        locate();
        const observer = new MutationObserver(locate);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => { observer.disconnect(); };
    }, [sessionId]);
    useLayoutEffect(() => {
        const scroller = target?.parentElement;
        if (scroller === undefined || scroller === null)
            return;
        const publishLayout = () => {
            scroller.style.setProperty('--oh-story-scroll-height', `${String(scroller.clientHeight)}px`);
            scroller.dataset.ohStoryWorkbench = workbench;
            const compactAt = 620;
            const mediumAt = 900;
            const layout = scroller.clientWidth < compactAt ? 'compact' : scroller.clientWidth < mediumAt ? 'medium' : 'wide';
            if (scroller.dataset.ohStoryLayout !== layout)
                scroller.dataset.ohStoryLayout = layout;
        };
        publishLayout();
        const observer = new ResizeObserver(publishLayout);
        observer.observe(scroller);
        return () => {
            observer.disconnect();
            scroller.style.removeProperty('--oh-story-scroll-height');
            delete scroller.dataset.ohStoryLayout;
            delete scroller.dataset.ohStoryWorkbench;
        };
    }, [target, workbench]);
    return _jsxs(_Fragment, { children: [_jsx("span", { ref: marker, className: "oh-story-bridge-marker", "aria-hidden": true }), target === undefined ? null : createPortal(_jsx(CreativeWorkbench, { sessionId: sessionId, runningCalls: runningCalls, partial: partial, settledMutation: settledMutation, sessionRunning: sessionRunning, productionQueue: productionQueue, productionIntents: productionIntents, sendProductionPrompt: sendProductionPrompt, cancelProduction: cancelProduction, removeQueuedProduction: removeQueuedProduction, useStore: useStore, actions: actions }), target)] });
}
function WorkbenchSeat({ SessionProvider, renderSlot }) {
    return _jsx(SessionProvider, { children: renderSlot('oh-story.workspace', {}) });
}
function argsOf(block) {
    const raw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? '{}';
    try {
        const value = JSON.parse(raw);
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    }
    catch {
        return {};
    }
}
function resultOf(block) {
    if (!('kind' in block))
        return undefined;
    return block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n');
}
function RoleToolView({ block, inspect }) {
    const args = argsOf(block);
    const role = typeof args.role === 'string' ? args.role : 'story-role';
    const output = resultOf(block);
    const state = !('kind' in block) ? 'running' : block.isError ? 'error' : 'done';
    return _jsxs("details", { className: "oh-story-role", "data-state": state, children: [_jsx("style", { children: styles }), _jsxs("summary", { children: [_jsx("span", { children: "\u2726 Role" }), _jsx("strong", { children: role }), _jsx("em", { children: state === 'running' ? '运行中' : state === 'error' ? '失败' : '完成' })] }), output !== undefined && _jsx("pre", { children: output }), inspect !== undefined && _jsx("button", { type: "button", onClick: inspect, children: "\u5728\u8F68\u8FF9\u4E2D\u68C0\u67E5" })] });
}
function ProductionToolView({ block, inspect }) {
    const args = argsOf(block);
    const action = typeof args.action === 'string' ? args.action : 'production';
    const episode = typeof args.episode === 'string' ? args.episode : '短剧';
    const state = !('kind' in block) ? 'running' : block.isError ? 'error' : 'done';
    return _jsxs("details", { className: "oh-story-role", "data-state": state, children: [_jsx("style", { children: styles }), _jsxs("summary", { children: [_jsx("span", { children: "\u25A6 \u751F\u4EA7" }), _jsxs("strong", { children: [episode, " \u00B7 ", action] }), _jsx("em", { children: state === 'running' ? '执行中' : state === 'error' ? '失败' : '已应用' })] }), resultOf(block) !== undefined && _jsx("pre", { children: resultOf(block) }), inspect !== undefined && _jsx("button", { type: "button", onClick: inspect, children: "\u5728\u8F68\u8FF9\u4E2D\u68C0\u67E5" })] });
}
/** Register only official DSH surfaces; the split bridge never replaces Chat. */
export function apply(context) {
    const slots = context.get('slots');
    if (slots === undefined)
        throw new Error('oh-story: slots service unavailable');
    slots.inject('shell.overlay', () => {
        const disposeSeat = slots.register({
            name: 'shell.overlay',
            id: 'oh-story-workspace',
            order: -100,
            children: { 'oh-story.workspace': { kind: 'single', scope: 'session' } },
        }, WorkbenchSeat);
        const disposeWorkbench = slots.register({
            name: 'oh-story.workspace',
            store: createWorkbenchStore,
            inject: (sessionId) => {
                const session = context.get('sessions')?.scope(sessionId);
                const conversation = session?.get('conversation');
                if (session === undefined || conversation === undefined) {
                    return {
                        sendProductionPrompt: () => Promise.reject(new Error('DSH 会话当前不可用。')),
                        cancelProduction: () => Promise.reject(new Error('DSH 会话当前不可用。')),
                        removeQueuedProduction: () => Promise.reject(new Error('DSH 会话当前不可用。')),
                    };
                }
                return {
                    sendProductionPrompt: (prompt) => conversation.send(prompt),
                    cancelProduction: () => conversation.cancel(),
                    removeQueuedProduction: (itemId) => conversation.updateQueue(itemId, { kind: 'remove' }),
                };
            },
        }, CreativeSplitBridge);
        return [disposeSeat, disposeWorkbench];
    });
    slots.inject('tool.call.toolview', () => slots.register({
        name: 'tool.call.toolview',
        key: 'oh_story_role',
    }, RoleToolView));
    slots.inject('tool.call.toolview', () => slots.register({
        name: 'tool.call.toolview',
        key: OH_STORY_PRODUCTION_TOOL_NAME,
    }, ProductionToolView));
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map