/**
 *
 * Tests for lib\git.ts
 *
 */
/// <reference types="jest" />
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import simpleGit, { CheckRepoActions } from "simple-git";
import temp from "temp";

import * as sut from "../git";
import { MapResult, PackageMapping } from "../mapping";
import {
  checkoutTempSimpleRepo,
  createTemporaryRepository,
  generateMadgeDependencyJsonForRepo,
  InputFileType,
  loadSimpleMadge,
  moveFileOutsideRepo,
} from "./test_fixtures";

async function buildPlan(tempRepoPath: string) {
  const oldDependencyJsonPath = await generateMadgeDependencyJsonForRepo(tempRepoPath);
  const dependencyJsonPath = moveFileOutsideRepo(
    tempRepoPath,
    oldDependencyJsonPath,
    InputFileType.DependencyJson
  );
  const m = loadSimpleMadge(dependencyJsonPath);
  const plan = sut.prepareGitMove(m);
  return { m, plan };
}

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
    expect(newRepo).toContainEqual(["lib/mapping.ts", "lib/package/new/mapping.ts"]);
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
  const planPromise = repoPromise.then(([tempRepoPath]) => buildPlan(tempRepoPath));

  const spy = jest.spyOn(global.console, "error");

  it("test setup successful and matches snapshot", async () => {
    const { plan } = await planPromise;
    expect(plan.get("new")).toBeDefined();
    expect(plan).toMatchSnapshot();
    expect(spy).not.toHaveBeenCalled();
  });

  it("checkoutTempSimpleRepo", async () => {
    const [tempRepoPath, tempRepo] = await repoPromise;
    expect(existsSync(tempRepoPath));
    await expect(tempRepo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)).resolves.toBeTruthy();
  });

  it("Execute default plan", async () => {
    const [tempRepoPath, tempRepo] = await repoPromise;
    const startCommitish = await tempRepo.revparse(["HEAD"]);
    const { m, plan } = await planPromise;
    const results = expect(
      sut.executeGitMoveForRepo(tempRepo, "new", plan.get("new")!, m)
    ).resolves;
    await results.toMatchSnapshot(`results from move to new`);
    expect(existsSync(join(tempRepoPath, "lib/index.ts"))).toBeFalsy();
    expect(existsSync(join(tempRepoPath, "lib/package/new/mapping.ts"))).toBeTruthy();

    await tempRepo.checkout(startCommitish);

    const resultsTestFixtures = expect(
      sut.executeGitMoveForRepo(tempRepo, "test_fixtures", plan.get("test_fixtures")!, m)
    ).resolves;
    await resultsTestFixtures.toMatchSnapshot(`results from move to test_fixtures`);
    expect(
      existsSync(join(tempRepoPath, "lib/package/test_fixtures/__tests__/test_fixtures.ts"))
    ).toBeTruthy();
  }, 15000);

  it("No errors on empty plan", async () => {
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
    const { m, plan: _plan } = await buildPlan(tempRepoPath);
    const results = expect(sut.executeGitMoveForRepo(tempRepo, "new", [], m)).resolves;
    await results.toMatchSnapshot(`results from empty plan`);
  }, 15000);
});
describe("executeGitMoveForRepos", () => {
  it("Should throw if branch split/any is present", async () => {
    const [_tempRepoPath, tempRepo] = await createTemporaryRepository("empty_folder");
    await expect(tempRepo.commit("Empty initial commit", ["--allow-empty"])).resolves.toBeDefined();
    await expect(tempRepo.branch(["split/any"])).resolves.toBeDefined();
    const m = new PackageMapping(); // X loadSimpleMadge();
    await expect(sut.executeGitMoveForRepos(tempRepo, new Map(), m)).rejects.toThrow(/split/i);
    /* .toThrowErrorMatchingInlineSnapshot() */
  });
  it("Complete simple split", async () => {
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
    const planPromise = buildPlan(tempRepoPath);
    const { m, plan } = await planPromise;
    expect(plan).toMatchSnapshot();
    const results = expect(sut.executeGitMoveForRepos(tempRepo, plan, m)).resolves;

    await results.toMatchSnapshot();

    expect(existsSync(join(tempRepoPath, "lib/index.ts"))).toBeTruthy();
    expect(existsSync(join(tempRepoPath, "lib/mapping.ts"))).toBeFalsy();
    expect(existsSync(join(tempRepoPath, "lib/__tests__/test_fixtures.ts"))).toBeFalsy();
  }, 15000);
  it("Respect .gitignore for mapped file", async () => {
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();

    // Simulate having a .ts file generated from another file and hence ignored
    const baseFilePath = join(tempRepoPath, "lib/mapping.scss");
    await writeFile(
      baseFilePath,
      `.callout {
      max-width: 90%;
      padding: 20px 24px;
    }`
    );

    await tempRepo.add(baseFilePath);
    console.debug(await tempRepo.status());
    await tempRepo.commit("Add file used by ignored file");

    const ignoredFilePath = join(tempRepoPath, "lib/mapping.scss.ts");
    await writeFile(
      ignoredFilePath,
      `require("lib/git.scss");
    const styles = {
      callout: 'callout_7bca76c6'
    };
    export default styles;`
    );

    const planPromise = buildPlan(tempRepoPath);
    const { m, plan } = await planPromise;
    const results = expect(sut.executeGitMoveForRepos(tempRepo, plan, m)).resolves;

    await results.toMatchSnapshot("results from executeGitMoveForRepos");

    expect(existsSync(join(tempRepoPath, "lib/mapping.scss.ts"))).toBeTruthy();
  }, 15000);
  it("Respect .gitignore for unmapped file", async () => {
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();

    // Simulate having a .ts file generated from another file and hence ignored
    const baseFilePath = join(tempRepoPath, "lib/git.scss");
    await writeFile(
      baseFilePath,
      `.callout {
      max-width: 90%;
      padding: 20px 24px;
    }`
    );

    await tempRepo.add(baseFilePath);
    console.debug(await tempRepo.status());
    await tempRepo.commit("Add file used by ignored file");

    const ignoredFilePath = join(tempRepoPath, "lib/git.scss.ts");
    await writeFile(
      ignoredFilePath,
      `require("lib/git.scss");
    const styles = {
      callout: 'callout_7bca76c6'
    };
    export default styles;`
    );

    const planPromise = buildPlan(tempRepoPath);
    const { m, plan } = await planPromise;
    const results = expect(sut.executeGitMoveForRepos(tempRepo, plan, m)).resolves;

    await results.toMatchSnapshot("results from executeGitMoveForRepos");

    expect(existsSync(join(tempRepoPath, "lib/git.scss.ts"))).toBeTruthy();
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
});
