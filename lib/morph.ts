import { createProject, Project, ts } from "@ts-morph/bootstrap";
import { basename } from "path";
import { ImportDeclaration } from "ts-morph";
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
export async function prepareTsMorph(
  mapping: PackageMapping,
  currentRepo: string = basename(process.cwd())
): Promise<{ project: Project; modifiedFiles: Set<ts.SourceFile> }> {
  // Read the existing project
  const project = await createProject({
    tsConfigFilePath: "tsconfig.json",
  });

  const languageService = project.getLanguageService();

  const sourceFiles = project.getSourceFiles();
  const modifiedFiles = new Set<ts.SourceFile>();
  // Update imports in all programs based on the mapping
  sourceFiles
    .filter((sourceFile) => !sourceFile.fileName?.includes("node_modules"))
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

      // try {
      sourceFile.forEachChild((node) => {
        if (ts.isImportDeclaration(node)) {
          const importPath = node.moduleSpecifier.getText();
          const mappedPath = mapping.mapPackage(importPath);

          console.debug(
            `${sourceFile.fileName}:${(
              node as any
            )?.getStartLineNumber?.()}:${node.getStart()}: ${node.getText()} => ${
              mappedPath ? node.getText().replace(importPath, mappedPath.Path) : ""
            } (${importPath})`
          );
          if (mappedPath) {
            if (mappedPath.Repo === currentRepo) {
              modifiedFiles.add(
                project.updateSourceFile(
                  sourceFile.fileName,
                  sourceFile.text.replace(importPath, mappedPath.Path)
                )
              );
            } else {
              (node as any).setModuleSpecifier(mappedPath.Package);
            }
          }
        }
      });
      // } catch (e) {
      //   console.error(e);
      // }

      // try {
      //   (sourceFile as any)
      //     .getImportDeclarations()
      //     .forEach((importDeclaration: ImportDeclaration) => {
      //       const importPath = importDeclaration.getModuleSpecifierValue();
      //       const mappedPath = mapping.mapPackage(importPath);
      //       if (mappedPath) {
      //         if (mappedPath.Repo === currentRepo) {
      //           importDeclaration.setModuleSpecifier(mappedPath.Path);
      //         } else {
      //           importDeclaration.setModuleSpecifier(mappedPath.Package);
      //         }
      //       }
      //     });
      // } catch (e) {
      //   console.error(e);
      // }

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

  return { project, modifiedFiles };
}
