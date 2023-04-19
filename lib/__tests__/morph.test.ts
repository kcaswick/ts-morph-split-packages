import { ts } from "@ts-morph/bootstrap";
import path from "path";
import { ls, popd, pushd } from "shelljs";
import simpleGit, { CheckRepoActions } from "simple-git";

import { MapResult, PackageMapping } from "../mapping";
import * as morph from "../morph";
import {
  advanceToPhase,
  checkoutTempSimpleRepo,
  loadSimpleMadge,
  ProcessPhase,
} from "./test_fixtures";

describe("test morph", function () {
  it("test morph.prepareTsMorph", async function () {
    const mapping = loadSimpleMadge();
    const modifiedProject = await morph.prepareTsMorph(mapping);
    expect(modifiedProject).toBeDefined();
    console.debug("Start snapshot");
  });
  test("test prepareTsMorph simple repo", async () => {
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
    const testState = await advanceToPhase(
      ProcessPhase.Move,
      { currentPhase: ProcessPhase.Initial, tempRepoPath, tempRepo },
      loadSimpleMadge
    );
    const status = await testState.tempRepo.status();
    expect(status).toMatchSnapshot("tempRepo.status");
    // TODO: Figure out if the right branch is checked out, or if we need to switch
    pushd(tempRepoPath);
    const modifiedProject = await morph.prepareTsMorph(testState.packageMapping);
    popd();
    expect(modifiedProject).toBeDefined();

    // Make sure it isn't doing:
    //    C:/Users/kcaswick/source/repos/External/ts-morph-split-packages/lib/__tests__/morph.test.ts:…:
    //    import {…} from "./test_fixtures"; =>  ("./test_fixtures")
    // instead:
    //    import {…} from "./test_fixtures"; => ("../../test_fixtures")
    const importDeclarationsFlat = modifiedProject.project
      .getSourceFiles()
      .filter((sourceFile) => !sourceFile.fileName?.includes("node_modules"))
      .flatMap((sf) => sf.forEachChild((x) => (ts.isImportDeclaration(x) ? [x] : [])))
      .filter((x) => x !== undefined) as Array<ts.ImportDeclaration>;
    const importDeclarationsFlatText = importDeclarationsFlat
      .map(
        (node) => `${path.relative(tempRepoPath, node.getSourceFile().fileName)}: ${node.getText()}`
      )
      .sort();
    expect(importDeclarationsFlatText).toMatchSnapshot("importDeclarationsFlatText");
    const testFixtureImports = importDeclarationsFlatText.filter((x) =>
      x.includes("test_fixtures")
    );
    expect(testFixtureImports).toMatchSnapshot("testFixtureImports");
    expect(testFixtureImports).not.toHaveLength(0);
    expect(testFixtureImports).not.toContain("./test_fixtures");
  }, 15000);
  test("save modified simple repo", async () => {
    // Arrange
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();
    const testState = await advanceToPhase(
      ProcessPhase.Move,
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
          modifiedFilesSet.forEach((file) => {
            modifiedProject.fileSystem.writeFileSync(file.fileName, file.text);
          });

          // Assert
          const status = await testState.tempRepo.status();
          expect(status).toMatchSnapshot(`tempRepo.status '${targetRepo}' after`);

          await testState.tempRepo.commit("Rewrite imports", ["--all"]);

          // Get the list of file names that were modified
          const modifiedFileNames = Array.from(modifiedFilesSet.values()).map((x) => x.fileName);

          // If and only if a file is in the list, it should be modified
          expect(status.modified.sort()).toContainEqual(modifiedFileNames.sort());
        })
      );
    } finally {
      popd();
    }
  }, 15000);
});
