import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

function listFiles(dir, extensions, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, extensions, acc);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

test("frontend component naming follows PascalCase", () => {
  const componentRoots = [
    path.join(ROOT, "apps/frontend/src/modules"),
    path.join(ROOT, "apps/frontend/src/shared/ui"),
    path.join(ROOT, "apps/frontend/src/app")
  ];

  const files = componentRoots.flatMap((dir) =>
    fs.existsSync(dir) ? listFiles(dir, [".jsx"]) : []
  );

  for (const file of files) {
    const name = path.basename(file, ".jsx");
    if (name === "main") {
      continue;
    }
    assert.match(name, /^[A-Z][A-Za-z0-9]*$/, `component file should be PascalCase: ${file}`);
  }
});

test("repository source files have no tabs or trailing spaces", () => {
  const files = listFiles(ROOT, [".js", ".jsx", ".mjs", ".sh", ".yml", ".md"])
    .filter((file) => !file.includes("package-lock.json"));

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      assert.equal(line.includes("\t"), false, `tab character in ${file}:${index + 1}`);
      assert.equal(/\s+$/.test(line), false, `trailing whitespace in ${file}:${index + 1}`);
    }
  }
});
