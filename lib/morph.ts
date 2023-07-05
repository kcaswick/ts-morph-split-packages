import { FileUtils } from "@ts-morph/common";
import { basename, dirname, relative } from "path";
import { Project, SourceFile, ts } from "ts-morph";

import { ILocation, PackageMapping } from "./mapping";

/**
 * Module that contains functions for interacting with ts-morph. Primarily, this is used to update imports to their new locations.
 * @module
 */

/**
 * Update all imports in the current project based on the provided mapping.
 *
 * @returns Updated, but not saved, project
 * @param mapping Mapping to use to update the imports
 * @param currentRepo Name of the current repository. This is used to determine if we should update the import to a relative
 *  path or not. Optional, defaults to the name of the current working directory.
 */
export /* async */ function prepareTsMorph(
  mapping: PackageMapping
): Promise<{ project: Project; modifiedFiles: Set<SourceFile> }> {
  // Read the existing project
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const sourceFiles = project.getSourceFiles();
  const modifiedFiles = new Set<SourceFile>();
  // Update imports in all programs based on the mapping
  sourceFiles
    .filter((sourceFile) => !sourceFile.getFilePath()?.includes("node_modules"))
    .forEach((sourceFile) => {
      try {
        const mappedSource = mapping.mapPackage(sourceFile.getFilePath());

        const importDeclarations = sourceFile.getImportDeclarations();
        const reExportDeclarations = sourceFile
          .getExportDeclarations()
          .filter((e) => e.isModuleSpecifierRelative());
        [...importDeclarations, ...reExportDeclarations].forEach((declaration) => {
          const importValue = declaration.getModuleSpecifierValue();
          const importPath =
            declaration.getModuleSpecifierSourceFile()?.getFilePath() ?? importValue;
          if (
            importValue === undefined ||
            importPath === undefined ||
            importPath.includes("node_modules")
          ) {
            // Skip imports that are already from outside packages
            // Also any exports that don't specify a module, so importPath cannot be undefined below
            return;
          }

          const mappedPath = mapping.mapPackage(importPath);
          const isSamePackage =
            mappedPath &&
            (mappedPath.Package === mappedSource?.Package || mappedPath.Package === "N/A");
          const newImport =
            mappedPath && isSamePackage
              ? sourceFileRelativeMappedPath(mappedSource, sourceFile, mappedPath)
              : mappedPath?.Package ?? "";

          const { line, column } =
            declaration === undefined
              ? { line: 0, column: 0 }
              : declaration.getSourceFile().getLineAndColumnAtPos(declaration.getStart());
          console.debug(
            `${sourceFile.getFilePath()}:${
              declaration?.getStartLineNumber?.() ?? line
            }:${column}: ${declaration.getText()} => ${
              mappedPath && importValue !== newImport
                ? `'${
                    isSamePackage
                      ? declaration.getText().replace(importValue, newImport)
                      : newImport
                  }'`
                : "no change"
            } (${importPath})`
          );
          if (mappedPath && importValue !== newImport) {
            modifiedFiles.add(sourceFile);
            declaration.setModuleSpecifier(newImport);
          }
        });
      } catch (e) {
        console.error(e);
      }
    });

  return Promise.resolve({ project, modifiedFiles });
}

/**
 * This function returns a relative path from the source file to the mapped path.
 * The mapped source path is used to resolve the relative path. If the mapped source path is not available, we use the current source file.
 * If the mapped source path is not available, we use the current source file. If there is no mapped source path, we use the current source file.
 * @param mappedSource The mapped source location, if available.
 * @param sourceFile The current source file.
 * @param mappedPath The mapped path to get a relative path to.
 * @returns A relative path from the source file to the mapped path.
 */
function sourceFileRelativeMappedPath(
  mappedSource: ILocation | undefined,
  sourceFile: SourceFile,
  mappedPath: ILocation
): string {
  let moduleSpecifier =
    mappedSource === undefined
      ? sourceFile.getRelativePathAsModuleSpecifierTo(mappedPath.Path)
      : sourceFile
          .getDirectory()
          .getDirectory(dirname(mappedSource.Path))
          ?.getRelativePathAsModuleSpecifierTo(mappedPath.Path) ??
        // If getRelativePathAsModuleSpecifierTo is not available, we make an effort but don't handle all cases
        FileUtils.standardizeSlashes(
          relative(
            dirname(mappedSource.Path),
            mappedPath.Path.replace(/\/index?(\.d\.ts|\.ts|\.js)$/i, "")
          )
        ).replace(/((\.d\.ts$)|(\.[^/.]+$))/i, "");
  moduleSpecifier = /^\.\.?\/?/.test(moduleSpecifier) ? moduleSpecifier : "./" + moduleSpecifier;
  return moduleSpecifier;
}

export const __forTesting__ = { sourceFileRelativeMappedPath };
