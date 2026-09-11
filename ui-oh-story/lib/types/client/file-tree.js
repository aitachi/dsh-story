function directory(name, path) {
    return { name, path, directories: new Map(), files: [] };
}
function compareNames(left, right) {
    return left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true });
}
function freezeDirectory(value) {
    const directories = [...value.directories.values()].map(freezeDirectory).sort(compareNames);
    const files = [...value.files].sort(compareNames);
    return {
        kind: 'directory',
        name: value.name,
        path: value.path,
        fileCount: files.length + directories.reduce((sum, child) => sum + child.fileCount, 0),
        children: [...directories, ...files],
    };
}
export function buildFileTree(files, group) {
    const root = directory(group, group);
    for (const file of files) {
        const relative = file.path.startsWith(`${group}/`) ? file.path.slice(group.length + 1) : file.path;
        const segments = relative.split('/').filter(segment => segment !== '');
        const name = segments.pop();
        if (name === undefined)
            continue;
        let parent = root;
        for (const segment of segments) {
            const path = `${parent.path}/${segment}`;
            const child = parent.directories.get(segment) ?? directory(segment, path);
            parent.directories.set(segment, child);
            parent = child;
        }
        parent.files.push({ kind: 'file', name, path: file.path, bytes: file.bytes });
    }
    return freezeDirectory(root).children;
}
//# sourceMappingURL=file-tree.js.map