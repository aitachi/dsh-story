//#region lib/types/index.js
/**
* Host registration for the Oh Story creative workbench client.
* Deliberately empty: the workbench is a browser capability contributed through
* the package's `dsh.client` bundle; the host half exists only so the Loader
* row for this package mounts.
*/
/** Host plugin body — the workbench UI lives in the client bundle. */
function apply() {}
const name = "oh-story-ui";
const inject = [];
var types_default = {
	name,
	inject,
	apply
};
//#endregion
export { apply, types_default as default, inject, name };
