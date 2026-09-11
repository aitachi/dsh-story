import { OH_STORY_PRODUCTION_TOOL_NAME, validateProductionIntent, } from './production-intent.js';
function parsedIntent(block) {
    if (!('kind' in block) || block.isError || block.call?.name !== OH_STORY_PRODUCTION_TOOL_NAME)
        return undefined;
    try {
        const args = JSON.parse(block.call.argsRaw);
        return { callId: block.callId, intent: validateProductionIntent(args) };
    }
    catch {
        return undefined;
    }
}
function visit(block, output) {
    const direct = parsedIntent(block);
    if (direct !== undefined)
        output.push(direct);
    for (const child of block.subCalls)
        visit(child, output);
}
/** Replay durable successful Agent UI intents in official DSH Chat order. */
export function settledProductionIntents(chat) {
    const output = [];
    for (const key of chat.order) {
        const node = chat.nodes.get(key);
        if (node?.kind !== 'tool-call')
            continue;
        const root = node.data.root;
        if (root !== undefined)
            visit(root, output);
    }
    return output;
}
//# sourceMappingURL=production-intents.js.map