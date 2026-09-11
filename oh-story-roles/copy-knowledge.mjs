import { cp, mkdir } from "node:fs/promises";
const root = new URL(".", import.meta.url);
const filter = (s) => !s.includes("__pycache__") && !s.endsWith(".pyc") && !s.endsWith(".DS_Store");
await mkdir(new URL("lib", root), { recursive: true });
for (const [from, to] of [["knowledge/oh-story/roles", "lib/oh-story/roles"], ["knowledge/oh-story/LICENSE.upstream", "lib/oh-story/LICENSE.upstream"], ["knowledge/oh-story/manifest.json", "lib/oh-story/manifest.json"]]) {
  await cp(new URL(from, root), new URL(to, root), { recursive: true, filter });
}
console.log("roles knowledge copied");
