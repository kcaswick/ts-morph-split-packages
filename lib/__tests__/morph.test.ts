import { ts } from "@ts-morph/bootstrap";
import path from "path";
import { popd, pushd } from "shelljs";
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
    expect((status)).toMatchSnapshot("tempRepo.status");
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
    const importDeclarationsFlat = modifiedProject
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
});
