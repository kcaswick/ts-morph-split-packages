// X import assert from "assert";
import { createWriteStream } from "fs";
import madge from "madge";
import { promisify } from "util";

import { loadSimpleMadge, simpleMadgeDependenciesPath } from "./test_fixtures";

describe("tsMorphSplitPackages basic tests", () => {
  it("generate simpleMadgeTestData", async () => {
    const m = await madge(["lib/"], {
      baseDir: ".",
      fileExtensions: ["ts", "tsx", "js", "jsx"],
      tsConfig: "tsconfig.json",
    });
    expect(m.warnings()).toMatchInlineSnapshot(`
      Object {
        "skipped": Array [],
      }
    `);

    const dependencies = m.obj();
    expect(dependencies).toBeDefined();

    const s = createWriteStream(simpleMadgeDependenciesPath, {
      flags: "w+",
    });
    try {
      const dependenciesJson = JSON.stringify(dependencies, undefined, 2);
      await promisify(
        s.write.bind(s) as (chunk: string, _?: (error: Error | null | undefined) => void) => boolean
      )(dependenciesJson);
    } catch (err) {
      if (err) {
        console.error(err);
      }
    } finally {
      s.close();
    }
  });

  it("test loading simpleMadgeTestData", () => {
    const m = loadSimpleMadge();
    expect(m).toMatchSnapshot();
  });

  it("test mapPackage", () => {
    const m = loadSimpleMadge();
    const result = m.mapPackage("lib/mapping.ts");
    expect(result).toBeDefined();
    expect(result?.Path).toBe("src/mapping.ts");
    expect(result).toMatchObject({
      Path: "src/mapping.ts",
      Repo: "new",
      Package: "new",
    });
  });

  it("test Export", () => {
    const m = loadSimpleMadge();
    const result = m.export();
    expect(result).toMatchInlineSnapshot(`
      "[
        {
          \\"OldName\\": \\"lib/mapping.ts\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/mapping.ts\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"lib/__tests__/test_fixtures.ts\\",
          \\"NewRepo\\": \\"test_fixtures\\",
          \\"NewPackage\\": \\"test_fixtures\\",
          \\"NewName\\": \\"src/__tests__/test_fixtures.ts\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"lib/__tests__/complexRepo.test.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/__tests__/complexRepo.test.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": [
            \\"ts-morph-split-packages:lib/index.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/__tests__/git.test.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/__tests__/git.test.ts\\",
          \\"Dependency Count\\": 3,
          \\"Package Dependencies\\": [
            \\"new\\",
            \\"test_fixtures\\"
          ],
          \\"dependencies\\": [
            \\"test_fixtures:src/__tests__/test_fixtures.ts\\",
            \\"ts-morph-split-packages:lib/git.ts\\",
            \\"new:src/mapping.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/__tests__/morph.test.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/__tests__/morph.test.ts\\",
          \\"Dependency Count\\": 3,
          \\"Package Dependencies\\": [
            \\"new\\",
            \\"test_fixtures\\"
          ],
          \\"dependencies\\": [
            \\"test_fixtures:src/__tests__/test_fixtures.ts\\",
            \\"new:src/mapping.ts\\",
            \\"ts-morph-split-packages:lib/morph.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/__tests__/tsMorphSplitPackages.test.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/__tests__/tsMorphSplitPackages.test.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [
            \\"test_fixtures\\"
          ],
          \\"dependencies\\": [
            \\"test_fixtures:src/__tests__/test_fixtures.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/git.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/git.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [
            \\"new\\"
          ],
          \\"dependencies\\": [
            \\"new:src/mapping.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/index.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/index.ts\\",
          \\"Dependency Count\\": 2,
          \\"Package Dependencies\\": [
            \\"new\\"
          ],
          \\"dependencies\\": [
            \\"ts-morph-split-packages:lib/git.ts\\",
            \\"new:src/mapping.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/morph.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/morph.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [
            \\"new\\"
          ],
          \\"dependencies\\": [
            \\"new:src/mapping.ts\\"
          ]
        }
      ]"
    `);
  });

  it("test export package dependencies", () => {
    const m = loadSimpleMadge();
    const result = m.exportPackageDependenciesChart();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "new": Array [],
        "test_fixtures": Array [],
        "ts-morph-split-packages": Array [
          "test_fixtures",
          "new",
        ],
      }
    `);
  });

  it.todo("test bad config filename");
  it.todo("test bad dependency filename");
});
