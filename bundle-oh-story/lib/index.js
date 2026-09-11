import { apply as apply$1 } from "@oh-story/skills";
import { apply as apply$2 } from "@oh-story/roles";
import { Config as Config$1, apply as apply$3 } from "@oh-story/workspace";
//#region lib/types/index.js
/** Release aggregator: one entry assembling every Oh Story capability.

Used only by the self-contained release tarball build (pack.mjs); inside the
repository the bundle's cordis.patch.yml composes the split rows instead.
*/
const name = "oh-story";
const inject = [
	"skills",
	"subagents",
	"tools",
	"typert",
	"webServer"
];
const Config = Config$1;
/** Mount every Oh Story capability into the current DSH process. */
async function apply(context, config = {}) {
	await apply$1(context);
	await apply$2(context);
	await apply$3(context, config);
}
var types_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, apply, types_default as default, inject, name };
