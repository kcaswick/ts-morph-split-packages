import { ensureDir } from "fs-extra";
import madge from "madge";
import path from "path";
import shell, { mv } from "shelljs";
import simpleGit, { SimpleGit } from "simple-git";
import { mkdir, track } from "temp";

import { PackageMapping } from "..";

// Automatically track and cleanup files at exit
track();

export const simpleMadgeConfigPath = "lib/__tests__/simpleMadgeTestData/PackageMap.json";
export const simpleMadgeDependenciesPath = "lib/__tests__/simpleMadgeTestData/selfMadge.json";

export async function checkoutTemporaryRepo(sourceRepo: SimpleGit, commitish: string) {
  const [destDir, destRepo] = await createTemporaryRepository();

  // Clone only the most recent 2 commits
  const sourceDir = await sourceRepo.revparse("--absolute-git-dir");
  await destRepo.addRemote("origin", sourceDir);
  const result = await destRepo.fetch("origin", commitish, {
    "--depth": 2,
    "--no-tags": null,
    "--no-recurse-submodules": null,
  });
  console.debug(`git fetch result: ${result.raw}`);
  await destRepo.checkout("FETCH_HEAD");
  return [destDir, destRepo] as [path: string, repo: SimpleGit];
}

/**
 * Creates a new temporary git repository in a new temporary directory.
 *
 * On Windows, this function also runs the `takeown` utility to ensure that the
 * temporary directory is owned by the current user.
 */
export async function createTemporaryRepository(
  affixes: Parameters<typeof mkdir>[0] = "test-worktree"
) {
  const temporaryDirectory = await mkdir(affixes);
  console.debug(`Temporary repo being created in ${temporaryDirectory}`);
  // On Windows, temporary folders may get created with different ownership, so fix it
  if (shell.which("takeown")) {
    shell.exec(`takeown /r /f "${temporaryDirectory}"`);
  }

  const temporaryRepository = simpleGit(temporaryDirectory);
  await temporaryRepository.init();
  return [temporaryDirectory, temporaryRepository] as [path: string, repo: SimpleGit];
}

export function checkoutTempSimpleRepo() {
  const ourRepo = simpleGit({ maxConcurrentProcesses: 1 });

  return checkoutTemporaryRepo(ourRepo, "72f460b7e4fb2af3fb15b0b6eb84d53a9b9dad98");
}

export async function generateMadgeDependencyJsonForRepo(
  repoPath: string,
  dependencyJsonPath = path.join(repoPath, "/doc/dependency.json")
) {
  const m = await madge([path.join(repoPath, "lib/")], {
    baseDir: repoPath,
    fileExtensions: ["ts", "tsx", "js", "jsx"],
    tsConfig: "tsconfig.json",
  });
  const dependencies = m.obj();
  const dependenciesJson = JSON.stringify(dependencies, undefined, 2);
  await ensureDir(path.dirname(dependencyJsonPath));
  shell.echo(dependenciesJson).to(dependencyJsonPath);
  return dependencyJsonPath;
}

export function loadSimpleMadge(dependencyJsonPath = simpleMadgeDependenciesPath) {
  const m = new PackageMapping();
  m.getPackageMap(dependencyJsonPath, simpleMadgeConfigPath);
  return m;
}

export enum InputFileType {
  DependencyJson = "dependency.json",
  PackageMapJson = "PackageMap.json",
}

/**
 * Moves a file outside of the repo, so that it won't trigger uncommitted change warnings.
 * @param repoPath The path to the repo
 * @param oldFilePath The path to the file to move
 * @returns The new path to the file
 */
export function moveFileOutsideRepo(
  repoPath: string,
  oldFilePath: string,
  fileType: InputFileType
) {
  const newFilePath = path.format({
    ...path.parse(repoPath),
    base: undefined /* so ext is not ignored */,
    ext: "." + fileType,
  });
  console.debug(`${InputFileType}Path"`, newFilePath, `old${InputFileType}Path`, oldFilePath);
  mv(oldFilePath, newFilePath);
  return newFilePath;
}
