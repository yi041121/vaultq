/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");

const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src/lib/image-validation.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, {
  exports: exportsObject, Buffer,
  require(id) {
    if (id !== "sharp") throw new Error(`Unexpected dependency: ${id}`);
    return { default: sharp };
  },
});

module.exports = {
  validation: exportsObject,
  png: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMwjekiiBhGFQEAP1tqIRKvxlsAAAAASUVORK5CYII=",
};
