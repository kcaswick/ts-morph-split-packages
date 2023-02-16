/**
 *
 * Tests for lib\git.ts
 *
 */
import {
  checkoutTempSimpleRepo,
  createTemporaryRepository,
  loadSimpleMadge,
} from "./test_fixtures";
import * as sut from "../git";
import { existsSync } from "fs";
import { join } from "path";
import simpleGit, { CheckRepoActions } from "simple-git";
import temp from "temp";
import { MapResult, PackageMapping } from "../mapping";
describe("prepareGitMove", () => {
  it("Expect to not log errors in console", () => {
    const spy = jest.spyOn(global.console, "error");
    const m = loadSimpleMadge();
    sut.prepareGitMove(m);
    expect(spy).not.toHaveBeenCalled();
  });
  it("Should run and match the snapshot", () => {
    const m = loadSimpleMadge();
    const result = sut.prepareGitMove(m);
    expect(result).toMatchSnapshot();
  });
  it("should move some files to new, and leave others", () => {
    const m = loadSimpleMadge();
    const result = sut.prepareGitMove(m);
    const newRepo = result.get("new");
    expect(newRepo).toBeDefined();
    expect(newRepo).toContainEqual(["lib/mapping.ts", "src/mapping.ts"]);
    expect(newRepo).not.toContainEqual(["lib/index.ts", expect.any(String)]);
  });
  it("No moves needed", () => {
    const mapping = Object.assign(new PackageMapping(), {
      depMap: [
        {
          Name: new MapResult({
            OldName: "ts-morph-split-packages",
            New: {
              Repo: "N/A",
              Package: "N/A",
              Path: "ts-morph-split-packages",
            },
          }),
        },
      ],
    } as PackageMapping);
    const currentRepo = "ts-morph-split-packages";
    const movesByRepo = sut.prepareGitMove(mapping, currentRepo);
    expect(movesByRepo.size).toStrictEqual(0);
  });
});
describe("executeGitMoveForRepo", () => {
  const repoPromise = checkoutTempSimpleRepo();

  const spy = jest.spyOn(global.console, "error");
  const m = loadSimpleMadge();
  const plan = sut.prepareGitMove(m).get("new");
  expect(plan).toBeDefined();
  expect(spy).not.toHaveBeenCalled();

  it("checkoutTempSimpleRepo", async () => {
    const [tempRepoPath, tempRepo] = await repoPromise;
    expect(existsSync(tempRepoPath));
    expect(tempRepo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)).resolves.toBeTruthy();
  });

  it("Execute default plan", async () => {
    const [tempRepoPath, tempRepo] = await repoPromise;
    const results = await sut.executeGitMoveForRepo(tempRepo, "new", plan!, m);
    // Wait for all promises to complete
    await new Promise(setImmediate);
    expect(results).toMatchSnapshot();
    expect(existsSync(join(tempRepoPath, "lib/index.ts"))).toBeFalsy();
    expect(existsSync(join(tempRepoPath, "src/mapping.ts"))).toBeTruthy();
  }, 15000);
});
describe("throwIfRepoNotReady", () => {
  it("Should throw if dir is not a repo", async () => {
    const tempRepoPath = await temp.mkdir("empty_folder");
    const tempRepo = simpleGit(tempRepoPath);
    const m = new PackageMapping(); // X loadSimpleMadge();
    await expect(sut.executeGitMoveForRepo(tempRepo, "fake", [], m)).rejects.toThrow(
      /fatal: (not a git repository (or any of the parent directories): |invalid gitfile format:.*)\.git/i
    );
  }, 15000);
  it("Should throw if branch split/any is present", async () => {
    const [_tempRepoPath, tempRepo] = await createTemporaryRepository("empty_folder");
    await expect(tempRepo.commit("Empty initial commit", ["--allow-empty"])).resolves.toBeDefined();
    await expect(tempRepo.branch(["split/any"])).resolves.toBeDefined();
    const m = new PackageMapping(); // X loadSimpleMadge();
    await expect(sut.executeGitMoveForRepo(tempRepo, "fake", [], m)).rejects.toThrow(/split/i);
    /* .toThrowErrorMatchingInlineSnapshot() */
  });
});
