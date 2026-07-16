import test from "node:test";
import assert from "node:assert/strict";
import { buildTree, countMarkdown, flattenMarkdown, findDefaultDoc } from "../src/tree.js";
import { makeFixture, cleanup } from "./fixture.js";

test("buildTree ignores node_modules and dotfiles", () => {
  const dir = makeFixture();
  try {
    const tree = buildTree(dir);
    const names = (tree.children || []).map((c) => c.name);
    assert.ok(names.includes("guide"), "includes guide dir");
    assert.ok(names.includes("README.md"), "includes README");
    assert.ok(!names.includes("node_modules"), "excludes node_modules");
    assert.ok(!names.includes(".hidden"), "excludes dotfiles");
  } finally {
    cleanup(dir);
  }
});

test("directories sort before files", () => {
  const dir = makeFixture();
  try {
    const tree = buildTree(dir);
    const types = (tree.children || []).map((c) => c.type);
    assert.equal(types[0], "dir");
    assert.equal(types[types.length - 1], "file");
  } finally {
    cleanup(dir);
  }
});

test("countMarkdown counts only markdown files", () => {
  const dir = makeFixture();
  try {
    // README + guide/intro + guide/deep/nested = 3 (svg + ignored dirs excluded)
    assert.equal(countMarkdown(buildTree(dir)), 3);
  } finally {
    cleanup(dir);
  }
});

test("flattenMarkdown returns depth-first, dirs before files", () => {
  const dir = makeFixture();
  try {
    const rels = flattenMarkdown(buildTree(dir)).map((f) => f.rel);
    assert.deepEqual(rels, ["guide/deep/nested.md", "guide/intro.md", "README.md"]);
  } finally {
    cleanup(dir);
  }
});

test("findDefaultDoc prefers a root README", () => {
  const dir = makeFixture();
  try {
    assert.equal(findDefaultDoc(buildTree(dir)), "README.md");
  } finally {
    cleanup(dir);
  }
});

test("--all mode includes non-markdown files", () => {
  const dir = makeFixture();
  try {
    const tree = buildTree(dir, { showAll: true });
    const assets = tree.children.find((c) => c.name === "assets");
    assert.ok(assets, "assets dir present in --all mode");
    assert.ok(assets.children.some((c) => c.name === "pic.svg"));
  } finally {
    cleanup(dir);
  }
});
