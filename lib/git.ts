import { ensureDir } from "fs-extra";
import { basename, dirname, join } from "path";
import { BranchSummary, SimpleGit } from "simple-git";

import { PackageMapping } from "./mapping";

export const prepareGitMove = (
  mapping: PackageMapping,
  currentRepo: string = basename(process.cwd())
) => {
  const movesByRepo = new Map<string, Parameters<SimpleGit["mv"]>[]>();
  mapping.depMap
    .filter(
      (x) =>
        !x.Name.isUnmapped() &&
        x.Name.New &&
        x.Name.New.Repo !== "N/A" &&
        x.Name.New.Repo !== currentRepo
    )
    .forEach((x) => {
      if (x.Name.New) {
        let repoList = movesByRepo.get(x.Name.New.Repo);
        if (!repoList) {
          movesByRepo.set(x.Name.New.Repo, (repoList = []));
        }

        repoList.push([x.Name.OldName, x.Name.New.Path]);
      }
    });

  return movesByRepo;
};

const ensureFoldersExist = async (targetPaths: string[]) => {
  console.debug(`Target paths: ${targetPaths.join(",")}`);
  const targetFolders = targetPaths
    .map((p) => dirname(p))
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => (b.length === a.length ? a.localeCompare(b) : b.length - a.length));
  console.debug(`Target folders: ${targetFolders.join(",")}`);
  return Promise.all(targetFolders.map(ensureDir));
};

export const executeGitMoveForRepo = async (
  currentRepo: SimpleGit,
  targetRepo: string,
  moves: Parameters<SimpleGit["mv"]>[],
  mapping: PackageMapping
) => {
  await throwIfRepoNotReady(currentRepo);
  await currentRepo.checkoutLocalBranch(mapping.config.BranchPrefix + targetRepo);
  await currentRepo.rm(
    mapping.depMap
      .filter((x) => x.Name.New && x.Name.New.Repo !== targetRepo)
      .map((x) => x.Name.OldName)
  );
  await currentRepo.commit(`Remove all files that are not part of ${targetRepo}`);

  const currentRepoPath = await currentRepo.revparse("--absolute-git-dir");
  await ensureFoldersExist(moves.map((x) => join(currentRepoPath, "..", x[1])));
  const results = await Promise.allSettled(moves.map((x) => currentRepo.mv(...x)));
  if (results.every((p) => p.status === "fulfilled")) {
    await currentRepo.commit(`Move all files for ${targetRepo} to their new locations`);
  }
  // TODO: Handle failures here or return mix? Probably should throw if any failed.

  return results;
};

const throwIfRepoNotReady = async (currentRepo: SimpleGit) => {
  if (!(await currentRepo.checkIsRepo())) {
    throw new Error(`Current directory must be a git working tree`);
  }

  // Check that no branches are named split/
  console.log("Checking for split branches");
  let branches: BranchSummary;
  try {
    branches = await currentRepo.branch(["--list", "split/*"]);
    console.debug(branches);
  } catch (e) {
    console.error(e);
    throw e;
  }

  if (branches.all.length > 0) {
    throw new Error(
      `Current directory must not have any branches starting with split/, but found branches ${branches.all.join(
        ","
      )}`
    );
  }

  // Check that no uncommitted changes, etc.
  const status = await currentRepo.status();
  if (!status.isClean()) {
    throw new Error(
      `Current directory must not have any uncommitted changes, but found ${status.files.map(
        (f) => f.path
      )}`
    );
  }
};
