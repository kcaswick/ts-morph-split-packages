import { ensureDir } from "fs-extra";
import { basename, dirname, join } from "path";
import { BranchSummary, GitError, SimpleGit } from "simple-git";

import { PackageMapping } from "./mapping";

interface PromiseRejectedResult<E extends GitError = GitError> {
  status: "rejected";
  reason: E;
}

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
        x.Name.New.Repo !== currentRepo &&
        x.Name.OldName !== x.Name.New.Path
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

const ensureFoldersExist = (targetPaths: string[]) => {
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
  await removeFilesNotInTargetRepo(currentRepo, targetRepo, mapping);

  const currentRepoPath = await currentRepo.revparse("--absolute-git-dir");
  await ensureFoldersExist(moves.map((x) => join(currentRepoPath, "..", x[1])));
  const results = await Promise.allSettled(moves.map((x) => currentRepo.mv(...x)));
  if (results.every((p) => p.status === "fulfilled")) {
    await currentRepo.commit(`Move all files for ${targetRepo} to their new locations`);
  }

  // Throw if any failed.
  const rejectedPromises = results.filter(
    (p) => p.status === "rejected"
  ) as PromiseRejectedResult[];
  if (rejectedPromises.length > 0) {
    console.debug(`Rejected promises: ${rejectedPromises}`);
    throw new AggregateError(rejectedPromises.map((p) => p.reason));
  }

  return results.map((p) => p.status === "fulfilled" && p.value);
};

export const executeGitMoveForRepos = async (
  currentRepo: SimpleGit,
  moves: Map<string, Parameters<SimpleGit["mv"]>[]>,
  mapping: PackageMapping
) => {
  // Check that no branches are named split/
  console.log("Checking for split branches");
  let branches: BranchSummary;
  try {
    branches = await currentRepo.branch(["--list", "split/*"]);
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

  const startCommitish = await currentRepo.revparse(["HEAD"]);

  const baseRepoName: string = basename(process.cwd());

  let moveResults = await Promise.all(
    Array.from(moves.entries()).flatMap(async ([repoPath, repoMoves]) => {
      const results = await executeGitMoveForRepo(currentRepo, repoPath, repoMoves, mapping);
      await currentRepo.checkout(startCommitish);
      return results;
    })
  );

  const baseMoves: Parameters<SimpleGit["mv"]>[] = mapping.depMap
    .filter(
      (x) =>
        !x.Name.isUnmapped() &&
        x.Name.New &&
        (x.Name.New.Repo === "N/A" || x.Name.New.Repo === baseRepoName) &&
        x.Name.OldName !== x.Name.New.Path
    )
    .map((x) => [x.Name.OldName, x.Name.New?.Path ?? ""]);
  const baseMoveResults = await executeGitMoveForRepo(
    currentRepo,
    baseRepoName,
    baseMoves,
    mapping
  );
  moveResults = moveResults.concat(baseMoveResults);

  return moveResults;
};

/**
 * Removes all files that are not part of the target repository.
 * @param currentRepo The git repo that we are currently on.
 * @param targetRepo The name of the repo that we are splitting to.
 * @param mapping The list of packages that are in the repository.
 */
async function removeFilesNotInTargetRepo(
  currentRepo: SimpleGit,
  targetRepo: string,
  mapping: PackageMapping
) {
  await currentRepo.rm(
    mapping.depMap
      .filter((x) => x.Name.New && x.Name.New.Repo !== targetRepo)
      .map((x) => x.Name.OldName)
  );
  await currentRepo.commit(`Remove all files that are not part of ${targetRepo}`);
}

const throwIfRepoNotReady = async (currentRepo: SimpleGit) => {
  if (!(await currentRepo.checkIsRepo())) {
    throw new Error(`Current directory must be a git working tree`);
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
