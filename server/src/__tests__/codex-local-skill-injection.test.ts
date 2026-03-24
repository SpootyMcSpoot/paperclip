import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexSkillsInjected } from "@stapleai/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createStapleRepoSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "adapter-utils"), { recursive: true });
  await fs.mkdir(path.join(root, "skills", skillName), { recursive: true });
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), '{"name":"staple"}\n', "utf8");
  await fs.writeFile(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

async function createCustomSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "custom", skillName), { recursive: true });
  await fs.writeFile(
    path.join(root, "custom", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

describe("codex local adapter skill injection", () => {
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("repairs a Codex Staple skill symlink that still points at another live checkout", async () => {
    const currentRepo = await makeTempDir("staple-codex-current-");
    const oldRepo = await makeTempDir("staple-codex-old-");
    const skillsHome = await makeTempDir("staple-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createStapleRepoSkill(currentRepo, "staple");
    await createStapleRepoSkill(oldRepo, "staple");
    await fs.symlink(path.join(oldRepo, "skills", "staple"), path.join(skillsHome, "staple"));

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{ name: "staple", source: path.join(currentRepo, "skills", "staple") }],
      },
    );

    expect(await fs.realpath(path.join(skillsHome, "staple"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "staple")),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Repaired Codex skill "staple"'),
      }),
    );
  });

  it("preserves a custom Codex skill symlink outside Staple repo checkouts", async () => {
    const currentRepo = await makeTempDir("staple-codex-current-");
    const customRoot = await makeTempDir("staple-codex-custom-");
    const skillsHome = await makeTempDir("staple-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(customRoot);
    cleanupDirs.add(skillsHome);

    await createStapleRepoSkill(currentRepo, "staple");
    await createCustomSkill(customRoot, "staple");
    await fs.symlink(path.join(customRoot, "custom", "staple"), path.join(skillsHome, "staple"));

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{ name: "staple", source: path.join(currentRepo, "skills", "staple") }],
    });

    expect(await fs.realpath(path.join(skillsHome, "staple"))).toBe(
      await fs.realpath(path.join(customRoot, "custom", "staple")),
    );
  });
});
