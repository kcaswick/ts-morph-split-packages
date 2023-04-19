import { Project, ts } from "@ts-morph/bootstrap";
import { ensureDir } from "fs-extra";
import madge from "madge";
import path from "path";
import shell, { mv, popd, pushd } from "shelljs";
import simpleGit, { SimpleGit } from "simple-git";
import { mkdir, track } from "temp";
import { Writable } from "ts-toolbelt/out/Object/Writable";

import { executeGitMoveForRepos, PackageMapping, prepareGitMove, prepareTsMorph } from "..";

// Automatically track and cleanup files at exit
track();

export const simpleMadgeConfigPath = "lib/__tests__/simpleMadgeTestData/PackageMap.json";
export const simpleMadgeDependenciesPath = "lib/__tests__/simpleMadgeTestData/selfMadge.json";

export enum ProcessPhase {
  Initial = "Initial",
  BuildDependencyGraph = "BuildDependencyGraph",
  Map = "Map",
  Move = "Move",
  Rewrite = "Rewrite",
}

export interface IBaseProcessPhaseState {
  currentPhase: ProcessPhase | undefined;
}

export interface IInitialPhaseState extends IBaseProcessPhaseState {
  currentPhase: ProcessPhase.Initial | undefined;
  tempRepoPath: string;
  tempRepo: SimpleGit;
}

type noPhase<T> = Omit<T, "currentPhase">;

interface IDependencyGraphPhaseState extends noPhase<IInitialPhaseState> {
  currentPhase: ProcessPhase.BuildDependencyGraph;
  madgeDependencyJsonPath: string;
}

interface IMapPhaseState extends noPhase<IDependencyGraphPhaseState> {
  currentPhase: ProcessPhase.Map;
  packageMapping: PackageMapping;
}

export interface IMovePhaseState extends noPhase<IMapPhaseState> {
  currentPhase: ProcessPhase.Move;
}

export interface IRewritePhaseState extends noPhase<IMovePhaseState> {
  currentPhase: ProcessPhase.Rewrite;
}

// Interface union of all possible states
export type IProcessPhaseState =
  | IInitialPhaseState
  | IDependencyGraphPhaseState
  | IMapPhaseState
  | IMovePhaseState
  | IRewritePhaseState;

/* eslint-disable no-case-declarations */
export async function advanceToPhase(
  endPhase: ProcessPhase.BuildDependencyGraph,
  startingState: Readonly<IInitialPhaseState>,
): Promise<IDependencyGraphPhaseState>;
export async function advanceToPhase(
  endPhase: ProcessPhase.Map,
  startingState: Readonly<IInitialPhaseState | IDependencyGraphPhaseState>,
  getPackageMap: (madgeDependencyJsonPath: string) => PackageMapping
): Promise<IMapPhaseState>;
// Multiphase move overload
export async function advanceToPhase(
  endPhase: ProcessPhase.Move,
  startingState: Readonly<IInitialPhaseState | IDependencyGraphPhaseState>,
  getPackageMap: (madgeDependencyJsonPath: string) => PackageMapping
): Promise<IMovePhaseState>;
// Single phase move overload
export async function advanceToPhase(
  endPhase: ProcessPhase.Move,
  startingState: Readonly<IMapPhaseState>
): Promise<IMovePhaseState>;
// Multiphase rewrite overload
export async function advanceToPhase(
  endPhase: ProcessPhase.Rewrite,
  startingState: Readonly<IInitialPhaseState | IDependencyGraphPhaseState | IMapPhaseState>,
  getPackageMap: (madgeDependencyJsonPath: string) => PackageMapping
): Promise<IRewritePhaseState>;

export async function advanceToPhase(
  endPhase: ProcessPhase,
  startingState: Readonly<IProcessPhaseState>,
  getPackageMap?: (madgeDependencyJsonPath: string) => PackageMapping
): Promise<IProcessPhaseState> {
  // Shallow clone the starting state so we can mutate it
  const currentState /* : Awaited<ReturnType<typeof advanceToPhase>> */ = Object.assign(
    Object.create(Object.getPrototypeOf(startingState)),
    startingState
  );

  switch (startingState.currentPhase ?? ProcessPhase.Initial) {
    default:
      throw new Error(`Unknown phase: ${endPhase}`);
    case undefined:
      await ensureDir(currentState.tempRepoPath);
    // fall through to next phase

    case ProcessPhase.Initial:
      const insideMadgeDependencyJsonPath = await generateMadgeDependencyJsonForRepo(
        currentState.tempRepoPath
      );
      currentState.madgeDependencyJsonPath = moveFileOutsideRepo(
        currentState.tempRepoPath,
        insideMadgeDependencyJsonPath,
        InputFileType.DependencyJson
      );
      currentState.currentPhase = ProcessPhase.BuildDependencyGraph;
      if (endPhase === currentState.currentPhase) break;
    // fall through to next phase

    case ProcessPhase.BuildDependencyGraph:
      if (getPackageMap === undefined)
        throw new Error("getPackageMap is required to complete the Map state");
      currentState.packageMapping = getPackageMap(currentState.madgeDependencyJsonPath);
      currentState.currentPhase = ProcessPhase.Map;
      if (endPhase === currentState.currentPhase) break;
    // fall through to next phase

    case ProcessPhase.Map:
      const moveTasks = prepareGitMove(currentState.packageMapping);
      await executeGitMoveForRepos(currentState.tempRepo, moveTasks, currentState.packageMapping);
      currentState.currentPhase = ProcessPhase.Move;
      if (endPhase === currentState.currentPhase) break;
    // fall through to next phase

    case ProcessPhase.Move:
      pushd(currentState.tempRepoPath);
      const { project: modifiedProject, modifiedFiles } = await prepareTsMorph(
        currentState.packageMapping
      );
      popd();
      // TODO: Save is not defined - figure out how to save and commit the changes
      // Maybe I need to use @ts-morph not @ts-morph/bootstrap for this to be available?
      // await modifiedProject.save();
      modifiedFiles.forEach((file) => {
        modifiedProject.fileSystem.writeFileSync(file.fileName, file.text);
      });
      await (<IMovePhaseState>currentState).tempRepo.commit("Rewrite imports", ["--all"]);
      currentState.currentPhase = ProcessPhase.Rewrite;
      if (endPhase === currentState.currentPhase) break;
    // fall through to next phase
  }

  return currentState;
}
/* eslint-enable no-case-declarations */

export async function checkoutTemporaryRepo(sourceRepo: SimpleGit, commitish: string) {
  const [destDir, destRepo] = await createTemporaryRepository();

  // Clone only the most recent 2 commits
  const sourceDir = await sourceRepo.revparse("--absolute-git-dir");
  await destRepo.addRemote("origin", sourceDir);
  const result = await destRepo.fetch("origin", commitish, {
    "--depth": 2,
    "--no-tags": null,
    "--no-recurse-submodules": null,
  });
  console.debug(`git fetch result: ${result.raw}`);
  await destRepo.checkout("FETCH_HEAD");
  return [destDir, destRepo] as [path: string, repo: SimpleGit];
}

/**
 * Creates a new temporary git repository in a new temporary directory.
 *
 * On Windows, this function also runs the `takeown` utility to ensure that the
 * temporary directory is owned by the current user.
 */
export async function createTemporaryRepository(
  affixes: Parameters<typeof mkdir>[0] = "test-worktree"
) {
  const temporaryDirectory = await mkdir(affixes);
  console.debug(`Temporary repo being created in ${temporaryDirectory}`);
  // On Windows, temporary folders may get created with different ownership, so fix it
  if (shell.which("takeown")) {
    shell.exec(`takeown /r /f "${temporaryDirectory}"`);
  }

  const temporaryRepository = simpleGit(temporaryDirectory);
  await temporaryRepository.init();
  return [temporaryDirectory, temporaryRepository] as [path: string, repo: SimpleGit];
}

export function checkoutTempSimpleRepo() {
  const ourRepo = simpleGit({ maxConcurrentProcesses: 1 });

  return checkoutTemporaryRepo(ourRepo, "72f460b7e4fb2af3fb15b0b6eb84d53a9b9dad98");
}

/**
 * This function checks tests that import statements have changed after a refactoring operation.
 *
 * @param importDeclarationsFlatText - An array of import statements as plain strings
 * @param oldName - The old name of the imported item
 * @param oldPath - The old path of the imported module
 */
export function expectImportChanged(
  importDeclarationsFlatText: string[],
  oldName: string,
  oldPath: string
) {
  const testFixtureImports = importDeclarationsFlatText.filter((x) => x.includes(oldName));
  expect(testFixtureImports).toMatchSnapshot(oldName);
  expect(testFixtureImports).not.toHaveLength(0);
  testFixtureImports.forEach((s) => {
    expect(s).not.toMatch(oldPath);
  });
}

export async function generateMadgeDependencyJsonForRepo(
  repoPath: string,
  dependencyJsonPath = path.join(repoPath, "/doc/dependency.json")
) {
  const m = await madge([path.join(repoPath, "lib/")], {
    baseDir: repoPath,
    fileExtensions: ["ts", "tsx", "js", "jsx"],
    tsConfig: "tsconfig.json",
  });
  const dependencies = m.obj();
  const dependenciesJson = JSON.stringify(dependencies, undefined, 2);
  await ensureDir(path.dirname(dependencyJsonPath));
  shell.echo(dependenciesJson).to(dependencyJsonPath);
  return dependencyJsonPath;
}

/** Get all import declarations in the project, excluding those in node_modules */
export const getInternalImportsFlat = (project: Project): ts.ImportDeclaration[] =>
  project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.fileName?.includes("node_modules"))
    .flatMap((sf) => sf.forEachChild((x) => (ts.isImportDeclaration(x) ? [x] : [])))
    .filter((x) => x !== undefined) as Array<ts.ImportDeclaration>;


/** This function takes a TypeScript import node and returns a string
that represents the source file and the import text. */
export function importNodeToText(
  tempRepoPath: string
): (value: ts.ImportDeclaration, index: number, array: ts.ImportDeclaration[]) => string {
  return (node) =>
    `${path.relative(tempRepoPath, node.getSourceFile().fileName)}: ${node.getText()}`;
}

export function loadSimpleMadge(dependencyJsonPath = simpleMadgeDependenciesPath) {
  const m = new PackageMapping();
  m.getPackageMap(dependencyJsonPath, simpleMadgeConfigPath);
  return m;
}

export enum InputFileType {
  DependencyJson = "dependency.json",
  PackageMapJson = "PackageMap.json",
}

/**
 * Moves a file outside of the repo, so that it won't trigger uncommitted change warnings.
 * @param repoPath The path to the repo
 * @param oldFilePath The path to the file to move
 * @returns The new path to the file
 */
export function moveFileOutsideRepo(
  repoPath: string,
  oldFilePath: string,
  fileType: InputFileType
) {
  const newFilePath = path.format({
    ...path.parse(repoPath),
    base: undefined /* so ext is not ignored */,
    ext: "." + fileType,
  });
  console.debug(`${InputFileType}Path"`, newFilePath, `old${InputFileType}Path`, oldFilePath);
  mv(oldFilePath, newFilePath);
  return newFilePath;
}
