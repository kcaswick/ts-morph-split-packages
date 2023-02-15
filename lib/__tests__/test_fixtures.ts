import shell from "shelljs";
import simpleGit, { SimpleGit } from "simple-git";
import { mkdir, track } from "temp";
import { PackageMapping } from "..";

// Automatically track and cleanup files at exit
track();

export const simpleMadgeConfigPath = "lib/__tests__/simpleMadgeTestData/PackageMap.json";
export const simpleMadgeDependenciesPath = "lib/__tests__/simpleMadgeTestData/selfMadge.json";

export async function checkoutTemporaryRepo(sourceRepo: SimpleGit, commitish: string) {
  const destDir = await mkdir("test-worktree");
  console.debug(`Temporary repo being created in ${destDir}`);
  // On Windows, temporary folders may get created with different ownership, so fix it
  if (shell.which("takeown")) {
    shell.exec(`takeown /r /f "${destDir}"`);
  }

  const result = await sourceRepo.raw("worktree", "add", "--detach", destDir, commitish);
  console.debug(`git add worktree result: ${result}`);
  const destRepo = simpleGit(destDir, { config: [`safe.directory=${destDir}`] });
  return destRepo;
}

export function checkoutTempSimpleRepo() {
  const ourRepo = simpleGit({});

  return checkoutTemporaryRepo(ourRepo, "72f460b7e4fb2af3fb15b0b6eb84d53a9b9dad98");
}

export function loadSimpleMadge() {
  const m = new PackageMapping();
  m.getPackageMap(simpleMadgeDependenciesPath, simpleMadgeConfigPath);
  return m;
}
