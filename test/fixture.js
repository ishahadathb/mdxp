import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Create a temporary directory tree used by the tests.
 * Lives under the OS temp dir so it can always be cleaned up.
 */
export function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdxplore-test-"));
  const write = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  write("README.md",
    "# Home\n\n" +
    "Welcome. See [intro](guide/intro.md) and ![pic](assets/pic.svg).\n\n" +
    "```mermaid\ngraph TD; A-->B;\n```\n\n" +
    "> [!NOTE]\n> A note.\n");

  write("guide/intro.md",
    "# Intro\n\n" +
    "Back [home](../README.md). Link to [nested](deep/nested.md). " +
    "External [site](https://example.com).\n\n" +
    "Some searchable content: pomegranate.\n");

  write("guide/deep/nested.md", "# Nested\n\ndeep doc\n");
  write("assets/pic.svg", "<svg xmlns='http://www.w3.org/2000/svg'></svg>");

  // These must be ignored by the tree walker.
  write("node_modules/junk.md", "# should be ignored\n");
  write(".hidden/secret.md", "# hidden\n");

  return dir;
}

export function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
