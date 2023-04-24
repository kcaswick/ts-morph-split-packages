import path from "path";
import { ls, popd, pushd } from "shelljs";
import simpleGit, { CheckRepoActions, SimpleGit } from "simple-git";
import { Project } from "ts-morph";

import { MapResult, PackageMapping } from "../mapping";
import * as morph from "../morph";
import {
  advanceToPhase,
  checkoutTempSimpleRepo,
  expectImportChanged,
  getInternalImportsFlat,
  IMapPhaseState,
  importNodeToText,
  loadSimpleMadge,
  ProcessPhase,
} from "./test_fixtures";

async function arrangeRepoAndSnapshot(
  branch?: string
): Promise<[string, SimpleGit, IMapPhaseState]> {
  const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
  const testState = await advanceToPhase(
    ProcessPhase.Map,
    { currentPhase: ProcessPhase.Initial, tempRepoPath, tempRepo },
    loadSimpleMadge
  );
  if (branch) {
    await tempRepo.checkout(branch);
  } else {
    await tempRepo.checkoutLocalBranch("test_branch");
  }

  const status = await testState.tempRepo.status();
  expect(status).toMatchSnapshot("tempRepo.status");
  return [tempRepoPath, tempRepo, testState];
}

describe("test morph", function () {
  it("test morph.prepareTsMorph", async function () {
    const mapping = loadSimpleMadge();
    const modifiedProject = await morph.prepareTsMorph(mapping);
    expect(modifiedProject).toBeDefined();
    console.debug("Start snapshot");
  });
  test("prepareTsMorph simple repo", async () => {
    // Arrange
    const [tempRepoPath, tempRepo, testState] = await arrangeRepoAndSnapshot();
    // TODO: Figure out if the right branch is checked out, or if we need to switch

    // Act
    pushd(tempRepoPath);
    const modifiedProject = await morph.prepareTsMorph(testState.packageMapping);
    popd();
    expect(modifiedProject).toBeDefined();

    // Assert

    // Make sure it isn't doing:
    //    C:/Users/kcaswick/source/repos/External/ts-morph-split-packages/lib/__tests__/morph.test.ts:…:
    //    import {…} from "./test_fixtures"; =>  ("./test_fixtures")
    // instead:
    //    import {…} from "./test_fixtures"; => ("../../test_fixtures")
    const importDeclarationsFlat = getInternalImportsFlat(modifiedProject.project);
    const importDeclarationsFlatText = importDeclarationsFlat
      .map(importNodeToText(tempRepoPath))
      .sort();
    expect(importDeclarationsFlatText).toMatchSnapshot("importDeclarationsFlatText");
    expectImportChanged(importDeclarationsFlatText, "test_fixtures", '"./test_fixtures');
  }, 15000);
  test("prepareTsMorph simple repo test_fixtures pkg", async () => {
    // Arrange
    const [tempRepoPath, _tempRepo, mapState] = await arrangeRepoAndSnapshot();

    // Act
    pushd(tempRepoPath);
    const rewriteState = await advanceToPhase(ProcessPhase.Rewrite, mapState, loadSimpleMadge);

    // Filter to just the files in the test_fixtures package
    const moveState = await advanceToPhase(ProcessPhase.Move, rewriteState);
    await mapState.tempRepo.checkout("split/test_fixtures");
    const finalProject = new Project({
      tsConfigFilePath: path.join(tempRepoPath, "tsconfig.json"),
    });
    popd();

    // Assert
    const importDeclarationsFlat = getInternalImportsFlat(finalProject);
    const importDeclarationsFlatText = importDeclarationsFlat
      .map(importNodeToText(tempRepoPath))
      .sort();
    expect(importDeclarationsFlatText).toMatchSnapshot("importDeclarationsFlatText");
    expectImportChanged(importDeclarationsFlatText, "PackageMapping", "..");
  }, 15000);
  test("save modified simple repo", async () => {
    // Arrange
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
    const testState = await advanceToPhase(
      ProcessPhase.Map,
      { currentPhase: ProcessPhase.Initial, tempRepoPath, tempRepo },
      loadSimpleMadge
    );
    expect(await tempRepo.status()).toMatchSnapshot(`tempRepo.status before`);
    pushd(tempRepoPath);
    try {
      const targetRepos = testState.packageMapping.depMap
        .flatMap((x) => (x.Name.isMapped() ? x.Name.New.Repo : []))
        .filter((value, index, self) => self.indexOf(value) === index)
        .sort();
      expect(targetRepos).toMatchInlineSnapshot(`
        Array [
          "new",
          "test_fixtures",
          "ts-morph-split-packages",
        ]
      `);
      // testState.packageMapping.depMap
      // .filter(
      //   (x) =>
      //     x.Name.isMapped() &&
      //     (x.Name.New.Repo === "N/A" || x.Name.New.Repo === baseRepoName) &&
      //     x.Name.OldName !== x.Name.New.Path
      // )
      // .map((x) => [x.Name.OldName, x.Name.New?.Path ?? ""]);
      await Promise.allSettled(
        targetRepos.map(async (targetRepo) => {
          console.debug(
            await testState.tempRepo.checkout(
              testState.packageMapping.config.BranchPrefix + targetRepo
          ));

          const { project: modifiedProject, modifiedFiles: modifiedFilesSet } =
            await morph.prepareTsMorph(testState.packageMapping, targetRepo);
          console.debug(
            `modifiedFilesSet.size for '${targetRepo}': ${modifiedFilesSet.size}`,
            modifiedFilesSet
          );
          if (modifiedFilesSet.size === 0) {
            return;
          }

          // Act
          await modifiedProject.save();

          // Assert
          const status = await testState.tempRepo.status();
          expect(status).toMatchSnapshot(`tempRepo.status '${targetRepo}' after`);

          await testState.tempRepo.commit("Rewrite imports", ["--all"]);

          // Get the list of file names that were modified
          const modifiedFileNames = Array.from(modifiedFilesSet.values()).map((x) => x.getFilePath());

          // If and only if a file is in the list, it should be modified
          expect(status.modified.sort()).toContainEqual(modifiedFileNames.sort());
        })
      );
    } finally {
      popd();
    }
  }, 15000);
});
