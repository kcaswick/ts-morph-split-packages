import { basename } from "path";
import { SimpleGit } from "simple-git";

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

export const executeGitMoveForRepo = async (
  currentRepo: SimpleGit,
  targetRepo: string,
  moves: Parameters<SimpleGit["mv"]>[],
  mapping: PackageMapping
) => {
  await currentRepo.checkoutLocalBranch(mapping.config.BranchPrefix + targetRepo);
  await currentRepo.rm(
    mapping.depMap
      .filter((x) => x.Name.New && x.Name.New.Repo !== targetRepo)
      .map((x) => x.Name.OldName)
  );
  await currentRepo.commit(`Remove all files that are not part of ${targetRepo}`);

  const results = await Promise.allSettled(moves.map((x) => currentRepo.mv(...x)));
  if (results.every((p) => p.status === "fulfilled")) {
    await currentRepo.commit(`Move all files for ${targetRepo} to their new locations`);
  }
  // TODO: Handle failures here or return mix? Probably should throw if any failed.

  return results;
};
