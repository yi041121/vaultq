/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("description blocks use the pale-blue surface, blue border and uppercase heading", () => {
  const box = read("src/components/description-box.tsx");
  assert.match(box, /title = "Description"/, "description is the default heading");
  assert.match(box, /color-mix\(in srgb, \$\{colors\.primary\} 30%, transparent\)/, "the border is blue");
  assert.match(box, /backgroundColor: colors\.primarySoft/, "the surface is pale blue");
  assert.match(box, /text-\[10px\] font-bold uppercase tracking-wide/, "the heading is uppercase");
  assert.match(box, /text-\[13px\] leading-relaxed/, "the body uses the shared readable size");
  assert.match(box, /data-description-box/);
});

test("every description display uses the shared component", () => {
  for (const file of [
    "src/components/item-details-modal.tsx",
    "src/components/student/report-card.tsx",
    "src/app/dashboard/student/claims/page.tsx",
    "src/app/dashboard/admin/page.tsx",
    "src/app/dashboard/admin/claims/page.tsx",
    "src/app/dashboard/admin/items/page.tsx",
    "src/app/dashboard/admin/reports/page.tsx",
  ]) {
    assert.match(read(file), /DescriptionBox/, `${file} uses the shared description design`);
  }
  const modal = read("src/components/item-details-modal.tsx");
  assert.match(modal, /<DescriptionBox className="mb-5" contentClassName="">/, "detail popups show the full description");
});
