/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard Latest Found Items opens details only from the explicit View Details action", () => {
  const page = read("src/app/dashboard/student/page.tsx");
  const start = page.indexOf("latestItems.map");
  const card = page.slice(start, page.indexOf("{latestItems.length > 1 &&", start));

  // The card, photo and title are static; nothing pushes the search page.
  assert.doesNotMatch(card, /<VCard[^>]*cursor-pointer/, "card body must not look clickable");
  assert.doesNotMatch(card, /<div className="w-full h-32[^"]*cursor-pointer/, "the photo is not a click target");
  assert.equal((card.match(/onClick=\{\(\) => viewItemDetails\(item\.name\)\}/g) ?? []).length, 1,
    "only the View Details button opens the item");
  assert.match(card, /<Eye size=\{13\} \/> View Details/);
  assert.doesNotMatch(card, /<h3[^>]*onClick=/, "the title is not part of the navigation target");
});

test("search results open details only from the explicit View Details action", () => {
  const page = read("src/app/dashboard/student/search/page.tsx");
  const start = page.indexOf("paginated.map");
  const card = page.slice(start, page.indexOf("<VPaginationFooter", start));

  assert.doesNotMatch(card, /<VCard[^>]*onClick=/, "card body must not open the details dialog");
  assert.doesNotMatch(card, /<VCard[^>]*cursor-pointer/, "card body must not look clickable");
  assert.doesNotMatch(card, /<div className="w-24 h-24[^"]*cursor-pointer/, "the photo is not a click target");
  assert.equal((card.match(/onClick=\{\(\) => setViewItem\(item\)\}/g) ?? []).length, 1,
    "only the View Details button opens the item");
  assert.match(card, /<Eye size=\{13\} \/> View Details/);
  assert.doesNotMatch(card, /<h3[^>]*onClick=/, "the photo and title are not part of the navigation target");
});

test("the student dashboard no longer duplicates the shell quick actions", () => {
  const page = read("src/app/dashboard/student/page.tsx");
  assert.doesNotMatch(page, /DashboardQuickActions|studentQuickActions|Quick actions/);
  assert.equal(fs.existsSync(path.join(root, "src/components/student/dashboard-quick-actions.tsx")), false);
});

test("the date range popup closes on a second tap without the backdrop swallowing the trigger", () => {
  const calendar = read("src/components/date-calendar.tsx");
  // A pointerdown-close followed by a click on the re-exposed trigger used to
  // reopen the panel on touch screens.
  assert.match(calendar, /fixed inset-0 z-\[90\] \$\{closeOnPointerLeave \? "pointer-events-none" : ""\}/);
  assert.match(calendar, /if \(!anchor\.contains\(target\) && !boxRef\.current\?\.contains\(target\)\) onClose\(\)/,
    "outside pointerdown still closes the panel");
  const search = read("src/app/dashboard/student/search/page.tsx");
  assert.match(search, /onClick=\{\(\) => \{ if \(dateRangeOpen\) closeDateCalendar\(\); else openDateCalendar\(\); \}\}/,
    "the trigger toggles the date popup");
});
