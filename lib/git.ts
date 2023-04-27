import { ensureDir } from "fs-extra";
import { basename, dirname, join } from "path";
import { BranchSummary, GitError, MoveResult, SimpleGit } from "simple-git";

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
        x.Name.isMapped() &&
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
  console.debug(`${targetPaths.length} target paths: ${targetPaths.join(",")}`);
  const targetFolders = targetPaths
    .map((p) => dirname(p))
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => (b.length === a.length ? a.localeCompare(b) : b.length - a.length));
  console.debug(`${targetFolders.length} target folders: ${targetFolders.join(",")}`);
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
  console.debug(`Removing files not in ${targetRepo}`);
  await removeFilesNotInTargetRepo(currentRepo, targetRepo, mapping);

  const throwMultipleFilesError = (x: Parameters<SimpleGit["mv"]>): string => {
    throw new Error(`Expected a single file but got list ${JSON.stringify(x[0])}`);
  };

  const ignored =
    moves.length > 0
      ? await currentRepo.checkIgnore(
          moves.map((x) => (typeof x[0] === "string" ? x[0] : throwMultipleFilesError(x)))
        )
      : [];
  console.debug(`Skipping ${ignored.length} git ignored files: ${ignored.join(",")}`);
  const movesInRepo = moves.filter(
    (x) => !ignored.includes(typeof x[0] === "string" ? x[0] : throwMultipleFilesError(x))
  );
  console.debug(`Moves remaining: ${movesInRepo.length}`);

  console.debug(`Ensuring destination folders exist for ${targetRepo}`);
  const currentRepoPath = await currentRepo.revparse("--absolute-git-dir");
  await ensureFoldersExist(movesInRepo.map((x) => join(currentRepoPath, "..", x[1])));
  console.debug(`Moving ${movesInRepo.length} files for ${targetRepo}`);
  const results = await Promise.allSettled(movesInRepo.map((x) => currentRepo.mv(...x)));
  const isPromiseFulfilled = <T>(p: PromiseSettledResult<T>) => p.status === "fulfilled";
  if (results.length > 0 && results.every(isPromiseFulfilled)) {
    try {
      await currentRepo.commit(`Move all files for ${targetRepo} to their new locations`);
    } catch (e) {
      const fulfilledPromises = results.filter(isPromiseFulfilled);
      console.debug(
        `${fulfilledPromises.length} fulfilled promises: ${JSON.stringify(fulfilledPromises)}`
      );
      throw e;
    }
  }

  // Throw if any failed.
  const rejectedPromises = results.filter(
    (p) => p.status === "rejected"
  ) as PromiseRejectedResult[];
  if (rejectedPromises.length > 0) {
    console.debug(
      `${rejectedPromises.length} rejected promises: ${JSON.stringify(rejectedPromises)}`
    );
    throw new AggregateError(rejectedPromises.map((p) => p.reason));
  }

  return results.map((p) => p.status === "fulfilled" && p.value);
};

export const executeGitMoveForRepos = async (
  currentRepo: SimpleGit,
  moves: Map<string, Parameters<SimpleGit["mv"]>[]>,
  mapping: PackageMapping,
  baseRepoName: string = basename(process.cwd())
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

  let moveResults = await Array.from(moves.entries()).reduce(
    async (lastProm, [repoPath, repoMoves]) => {
      const resultSoFar: (false | MoveResult)[] = await lastProm;
      const results: (false | MoveResult)[] = await executeGitMoveForRepo(
        currentRepo,
        repoPath,
        repoMoves,
        mapping
      );
      await currentRepo.checkout(startCommitish);
      return [...resultSoFar, ...results];
    },
    Promise.resolve<(false | MoveResult)[]>([])
  );

  const baseMoves: Parameters<SimpleGit["mv"]>[] = mapping.depMap
    .filter(
      (x) =>
        x.Name.isMapped() &&
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
  const filesToRemove = mapping.depMap
    .filter((x) => x.Name.isMapped() && x.Name.New.Repo !== targetRepo)
    .map((x) => x.Name.OldName);
  const ignored = await currentRepo.checkIgnore(filesToRemove);
  const gitFilesToRemove = filesToRemove.filter((x) => !ignored.includes(x));
  console.debug(`${gitFilesToRemove.length} files to remove: ${gitFilesToRemove.join(",")}`);
  await currentRepo.rm(gitFilesToRemove);
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
      `Current directory must not have any uncommitted changes, but found ${
        status.files.length
      }: ${status.files.map((f) => f.path)}`
    );
  }
};
