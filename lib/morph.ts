import { basename } from "path";
import { ExportDeclaration, ImportDeclaration, Project, SourceFile, ts } from "ts-morph";
import { getImportDeclarationsForSymbols } from "ts-morph-helpers";

import { PackageMapping } from "./mapping";

/**
 * Update all imports in the current project based on the provided mapping.
 *
 * @returns Updated, but not saved, project
 * @param mapping Mapping to use to update the imports
 * @param currentRepo Name of the current repository. This is used to determine if we should update the import to a relative
 *  path or not. Optional, defaults to the name of the current working directory.
 */
export /* async */ function prepareTsMorph(
  mapping: PackageMapping,
  currentRepo: string = basename(process.cwd())
): Promise<{ project: Project; modifiedFiles: Set<SourceFile> }> {
  // Read the existing project
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const languageService = project.getLanguageService();

  const sourceFiles = project.getSourceFiles();
  const modifiedFiles = new Set<SourceFile>();
  // Update imports in all programs based on the mapping
  sourceFiles
    .filter((sourceFile) => !sourceFile.getFilePath()?.includes("node_modules"))
    .forEach((sourceFile) => {
      //   try {
      //     getImportDeclarationsForSymbols(
      //     languageService.getProgram().getTypeChecker().,
      //     sourceFile
      //   ).forEach((importDeclaration) => {
      //     const importPath = importDeclaration.getModuleSpecifierValue();
      //     const mappedPath = mapping.mapPackage(importPath);

      //     if (mappedPath) {
      //       if (mappedPath.Repo === currentRepo) {
      //         importDeclaration.setModuleSpecifier(mappedPath.Path);
      //       } else {
      //         importDeclaration.setModuleSpecifier(mappedPath.Package);
      //       }
      //     }
      //   });
      // } catch (e) {
      //   console.error(e);
      // }

      // // try {
      // sourceFile.forEachChild((node) => {
      //   if (ts.isImportDeclaration(node)) {
      //     const importPath = node.moduleSpecifier.getText();
      //     const mappedPath = mapping.mapPackage(importPath);
      //     const isSameRepo = mappedPath && mappedPath.Repo === currentRepo;

      //     console.debug(
      //       `${sourceFile.fileName}:${(
      //         node as any
      //       )?.getStartLineNumber?.()}:${node.getStart()}: ${node.getText()} => "${
      //         mappedPath
      //           ? isSameRepo
      //             ? node.getText().replace(importPath, mappedPath.Path)
      //             : mappedPath.Package
      //           : "no change"
      //       }" (${importPath})`
      //     );
      //     if (mappedPath) {
      //       if (isSameRepo) {
      //         modifiedFiles.add(
      //           project.updateSourceFile(
      //             sourceFile.fileName,
      //             sourceFile.text.replace(importPath, mappedPath.Path)
      //           )
      //         );
      //       } else {
      //         (node as any).setModuleSpecifier(mappedPath.Package);
      //       }
      //     }
      //   }
      // });
      // // } catch (e) {
      // //   console.error(e);
      // // }

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
          const isSameRepo =
            mappedPath && (mappedPath.Repo === mappedSource?.Repo || mappedPath.Package === "N/A");
          const newImport =
            mappedPath && isSameRepo
              ? sourceFile.getRelativePathAsModuleSpecifierTo(mappedPath.Path)
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
                ? `"${
                    isSameRepo ? declaration.getText().replace(importValue, newImport) : newImport
                  }"`
                : "no change"
            } (${importPath})`
          );
          if (mappedPath && importValue !== newImport) {
            modifiedFiles.add(sourceFile);
            if (isSameRepo) {
              declaration.setModuleSpecifier(
                // TODO: This should be relative to the sourceFile's mapped path, but we can't calculate that without a root path
                newImport
              );
            } else {
              declaration.setModuleSpecifier(newImport);
            }
          }
        });
      } catch (e) {
        console.error(e);
      }

      // try {
      //   sourceFile.statements.forEach((statement) => {
      //     if (ts.isImportDeclaration(statement)) {
      //       const importPath = (statement as any).getModuleSpecifierValue();
      //       const mappedPath = mapping.mapPackage(importPath);
      //       if (mappedPath) {
      //         if (mappedPath.Repo === currentRepo) {
      //           (statement as any).setModuleSpecifier(mappedPath.Path);
      //         } else {
      //           (statement as any).setModuleSpecifier(mappedPath.Package);
      //         }
      //       }
      //     }
      //   });
      // } catch (e) {
      //   console.error(e);
      // }

      // try {
      //   (sourceFile as any).imports.forEach((importDeclaration: ImportDeclaration) => {
      //     const importPath = importDeclaration.getModuleSpecifierValue();
      //     const mappedPath = mapping.mapPackage(importPath);
      //     if (mappedPath) {
      //       if (mappedPath.Repo === currentRepo) {
      //         importDeclaration.setModuleSpecifier(mappedPath.Path);
      //       } else {
      //         importDeclaration.setModuleSpecifier(mappedPath.Package);
      //       }
      //     }
      //   });
      // } catch (e) {
      //   console.error(e);
      // }
    });

  return Promise.resolve({ project, modifiedFiles });
}
