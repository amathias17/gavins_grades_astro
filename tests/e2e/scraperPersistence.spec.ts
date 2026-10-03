import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { readJsonIfExists, writeJsonAtomically, acquireScraperLock } = require("../../scraper/enhanced-scraper.cjs") as {
  readJsonIfExists: (filePath: string) => Promise<unknown | null>;
  writeJsonAtomically: (filePath: string, value: unknown) => Promise<void>;
  acquireScraperLock: (filePath: string) => Promise<() => Promise<void>>;
};

test.describe("scraper JSON persistence", () => {
  test("reports malformed existing JSON instead of treating it as a missing file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gavins-grades-json-"));
    const filePath = join(directory, "broken.json");

    try {
      await writeFile(filePath, '{"metadata":\n{');
      await expect(readJsonIfExists(filePath)).rejects.toThrow(`Invalid JSON in ${filePath}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("replaces a JSON file through a temporary file without leaving partial output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gavins-grades-json-"));
    const filePath = join(directory, "grades.json");

    try {
      await writeJsonAtomically(filePath, { version: 1 });
      await writeJsonAtomically(filePath, { version: 2, classes: ["A"] });

      await expect(readFile(filePath, "utf8")).resolves.toBe(JSON.stringify({ version: 2, classes: ["A"] }, null, 2));
      await expect(readJsonIfExists(filePath)).resolves.toEqual({ version: 2, classes: ["A"] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("prevents two scraper runs from taking the same local lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gavins-grades-lock-"));
    const lockPath = join(directory, "scraper.lock");
    const release = await acquireScraperLock(lockPath);

    try {
      await expect(acquireScraperLock(lockPath)).rejects.toThrow(/Another enhanced scraper run is active/);
    } finally {
      await release();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
