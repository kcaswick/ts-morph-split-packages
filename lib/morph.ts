import { createProject, ts } from "@ts-morph/bootstrap";
import { basename } from "path";
import { ImportDeclaration } from "ts-morph";
import { getImportDeclarationsForSymbols } from "ts-morph-helpers";

import { PackageMapping } from "./mapping";

export async function prepareTsMorph(
  mapping: PackageMapping,
  currentRepo: string = basename(process.cwd())
) {
  // Read the existing project
  const project = await createProject({
    tsConfigFilePath: "tsconfig.json",
  });

  const languageService = project.getLanguageService();

  const sourceFiles = project.getSourceFiles();
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
            `${sourceFile.fileName}:${(node as any)?.getStartLineNumber?.()}:${node.getStart()}: ${node.getText()} => ${
              mappedPath ? node.getText().replace(importPath, mappedPath.Path) : ""
            } (${importPath})`
          );
          if (mappedPath) {
            if (mappedPath.Repo === currentRepo) {
              project.updateSourceFile(
                sourceFile.fileName,
                sourceFile.text.replace(importPath, mappedPath.Path)
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
}
