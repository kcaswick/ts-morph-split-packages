/// <reference types="jest" />
import { promises as fs } from "fs"; // For workaround
import path from "path";
import { ls, popd, pushd } from "shelljs";
import simpleGit, { CheckRepoActions, SimpleGit } from "simple-git";
import { Directory, Project, SourceFile } from "ts-morph";

import { ILocation, MapResult, PackageMapping } from "../mapping";
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

function arrangeSourceFile(fileContent: string, filePath?: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(filePath || "temp.ts", fileContent);
  return sourceFile;
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
    // TODO: Add feature to rewrite re-exports from excluded files
    // const [tempRepoPath, _tempRepo, mapState] = await arrangeRepoAndSnapshot();

    // BEGIN workaround for above feature not implemented yet, simulating a manual fix
    const [tempRepoPath, tempRepo] = await checkoutTempSimpleRepo();

    // Alter first line of lib/__tests__/test_fixtures.ts to replace "../../lib" with "../../lib/mapping"
    const testFixturesPath = path.join(tempRepoPath, "lib", "__tests__", "test_fixtures.ts");
    const testFixturesText = await fs.readFile(testFixturesPath, "utf8");
    const testFixturesTextNew = testFixturesText.replace(
      'import { PackageMapping } from "..";',
      'import { PackageMapping } from "../mapping";'
    );
    await fs.writeFile(testFixturesPath, testFixturesTextNew);
    expect(testFixturesTextNew).not.toEqual(testFixturesText);

    await tempRepo.add(testFixturesPath);
    console.debug(await tempRepo.status());
    await tempRepo.commit("test_fixtures.ts: Fix import path");

    const mapState = await advanceToPhase(
      ProcessPhase.Map,
      { currentPhase: ProcessPhase.Initial, tempRepoPath, tempRepo },
      loadSimpleMadge
    );
    await tempRepo.checkoutLocalBranch("test_branch");

    const status = await mapState.tempRepo.status();
    expect(status).toMatchSnapshot("tempRepo.status");
    // END workaround for above feature not imlemented yet

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
  }, 20000);
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
            await morph.prepareTsMorph(testState.packageMapping);
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
describe("Test sourceFileRelativeMappedPath", () => {
  // Helper function to create a mocked source file
  function createMockSourceFile(): SourceFile {
    const mockSourceFile: Partial<SourceFile> = {
      getRelativePathAsModuleSpecifierTo: jest.fn(),
      getDirectory: jest.fn(
        () =>
          ({
            getDirectory: jest.fn<Directory, []>(),
          } as unknown as Directory)
      ),
    };
    return mockSourceFile as SourceFile;
  }

  type TRelPathData = {
    sourceContents?: string;
    sourceOldPath?: string;
    sourceMappedPath?: string;
    targetMappedPath: string;
    expectedValue: string;
  };
  const dataset: TRelPathData[] = [
    {
      // Test reference to file in parent dir using unmapped SourceFile
      sourceContents: 'import * as sut from "../git";',
      sourceOldPath: "C:\\tmp\\repo123\\lib\\__tests__\\git.test.ts",
      sourceMappedPath: undefined,
      targetMappedPath: "C:\\tmp\\repo123\\lib\\git.ts",
      expectedValue: "../git",
    },
    {
      // Test reference to file in parent dir using SourceFile
      sourceContents: 'import * as sut from "../git";',
      sourceOldPath: "/tmp/repo123/lib/__tests__/git.test.ts",
      sourceMappedPath: "/tmp/repo123/lib/package/base/__tests__/git.test.ts",
      targetMappedPath: "/tmp/repo123/lib/package/base/git.ts",
      expectedValue: "../git",
    },
    {
      // Test reference to file in parent dir using unmapped SourceFile
      sourceContents: 'import * as sut from "../git";',
      sourceOldPath: "C:\\tmp\\repo123\\lib\\__tests__\\git.test.ts",
      targetMappedPath: "C:\\tmp\\repo123\\lib\\git.ts",
      expectedValue: "../git",
    },
    {
      // Test reference to file in parent dir
      sourceMappedPath: "C:\\tmp\\repo123\\lib\\__tests__\\git.test.ts",
      targetMappedPath: "C:\\tmp\\repo123\\lib\\git.ts",
      expectedValue: "../git",
    },
    {
      // Test mixed slashes
      sourceMappedPath: "C:\\tmp\\repo123\\lib\\__tests__\\git.test.ts",
      targetMappedPath: "/tmp/repo123/lib/git.ts",
      expectedValue: "../git",
    },
    {
      // Test reference to entire parent dir using unmapped SourceFile
      sourceContents: 'import { PackageMapping } from "..";',
      sourceOldPath: "/tmp/repo123/lib/__tests__/complexRepo.test.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "../../lib", // "..", is simpler, not sure why it is taking the long route, but that still is valid
    },
    {
      // Test reference to entire parent dir
      sourceMappedPath: "/tmp/repo123/lib/__tests__/complexRepo.test.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "..",
    },
    {
      // Test mixed slashes reference to entire parent dir
      sourceMappedPath: "C:\\tmp\\repo123\\lib\\__tests__\\test_fixtures.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "..",
    },
    {
      // (repro test failure) with reference to entire parent dir that is in package "N/A" using unmapped SourceFile
      sourceContents: 'import { PackageMapping } from "..";',
      sourceOldPath: "C:\\tmp\\repo123\\lib\\__tests__\\test_fixtures.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "../../lib", // "..", is simpler, not sure why it is taking the long route, but that still is valid
    },
    {
      // (repro test failure) with reference to entire parent dir that is in package "N/A" using mapped SourceFile
      sourceContents: 'import { PackageMapping } from "..";',
      sourceOldPath: "C:\\tmp\\repo123\\lib\\__tests__\\test_fixtures.ts",
      sourceMappedPath: "/tmp/repo123/lib/package/test_fixtures/__tests__/test_fixtures.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "../../..",
    },
    {
      // (repro test failure) with reference to entire parent dir that is in package "N/A" without SourceFile
      sourceMappedPath: "/tmp/repo123/lib/package/test_fixtures/__tests__/test_fixtures.ts",
      targetMappedPath: "/tmp/repo123/lib/index.ts",
      expectedValue: "../../..",
    },
    {
      // Test reference to file in same dir using mapped SourceFile
      sourceContents: 'import * from "./git";',
      sourceOldPath: "/tmp/repo123/lib/index.ts",
      sourceMappedPath: "/tmp/repo123/lib/index.ts",
      targetMappedPath: "/tmp/repo123/lib/git.ts",
      expectedValue: "./git",
    },
    {
      // Test reference to file in same dir using unmapped SourceFile
      sourceContents: 'import * from "./git";',
      sourceOldPath: "/tmp/repo123/lib/index.ts",
      sourceMappedPath: undefined,
      targetMappedPath: "/tmp/repo123/lib/git.ts",
      expectedValue: "./git",
    },
    {
      // Test reference to file in same dir without SourceFile
      sourceContents: undefined,
      sourceMappedPath: "/tmp/repo123/lib/index.ts",
      targetMappedPath: "/tmp/repo123/lib/git.ts",
      expectedValue: "./git",
    },
  ];
  it.each(dataset)(
    "$sourceOldPath,$sourceMappedPath,$targetMappedPath>$expectedValue",
    function ({
      sourceContents,
      sourceOldPath,
      sourceMappedPath,
      targetMappedPath,
      expectedValue,
    }: TRelPathData) {
      const sourceFile =
        sourceContents === undefined
          ? createMockSourceFile()
          : arrangeSourceFile(sourceContents, sourceOldPath);
      const mappedSource: ILocation | undefined =
        sourceMappedPath === undefined
          ? undefined
          : {
              Path: sourceMappedPath,
              Repo: "",
              Package: "",
            };
      const mappedPath: ILocation = {
        Path: targetMappedPath,
        Repo: "",
        Package: "",
      };
      const res = morph.__forTesting__.sourceFileRelativeMappedPath(
        mappedSource,
        sourceFile,
        mappedPath
      );
      expect(res).toBe(expectedValue);
    }
  );
});
