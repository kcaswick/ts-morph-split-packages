// X import assert from "assert";
import { createWriteStream } from "fs";
import madge from "madge";
import { promisify } from "util";
import { PackageMapping } from "../index";

describe("tsMorphSplitPackages basic tests", () => {
  const simpleMadgeConfigPath = "lib/__tests__/simpleMadgeTestData/PackageMap.json";
  const simpleMadgeDependenciesPath = "lib/__tests__/simpleMadgeTestData/selfMadge.json";

  it("generate simpleMadgeTestData", async () => {
    const m = await madge(
      [
        "lib/index.ts",
        "./dist/cjs/index.cjs",
        "dist/esm/index.mjs",
        "./dist/index.js",
        "./dist/index.d.ts",
        "./dist/bundle.d.ts",
      ],
      {
        baseDir: ".",
        fileExtensions: ["ts", "tsx", "js", "jsx"],
        tsConfig: "tsconfig.json",
      }
    );
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
        // eslint-disable-next-line no-unused-vars
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

  function loadSimpleMadge() {
    const m = new PackageMapping();
    m.getPackageMap(simpleMadgeDependenciesPath, simpleMadgeConfigPath);
    return m;
  }

  it("test loading simpleMadgeTestData", () => {
    const m = loadSimpleMadge();
    expect(m).toMatchSnapshot();
  });

  it("test mapPackage", () => {
    const m = loadSimpleMadge();
    const result = m.mapPackage("dist/index.js");
    expect(result).toBeDefined();
    expect(result?.Path).toBe("src/index.js");
    expect(result).toMatchObject({
      Path: "src/index.js",
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
          \\"OldName\\": \\"dist/bundle.d.ts\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/bundle.d.ts\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"dist/cjs/index.cjs\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/cjs/index.cjs\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"dist/esm/index.mjs\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/esm/index.mjs\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"dist/index.d.ts\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/index.d.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": [
            \\"new:src/mapping.d.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"dist/index.js\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/index.js\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": [
            \\"new:src/mapping.js\\"
          ]
        },
        {
          \\"OldName\\": \\"dist/mapping.d.ts\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/mapping.d.ts\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"dist/mapping.js\\",
          \\"NewRepo\\": \\"new\\",
          \\"NewPackage\\": \\"new\\",
          \\"NewName\\": \\"src/mapping.js\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
        },
        {
          \\"OldName\\": \\"lib/index.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/index.ts\\",
          \\"Dependency Count\\": 1,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": [
            \\"ts-morph-split-packages:lib/mapping.ts\\"
          ]
        },
        {
          \\"OldName\\": \\"lib/mapping.ts\\",
          \\"NewRepo\\": \\"ts-morph-split-packages\\",
          \\"NewPackage\\": \\"N/A\\",
          \\"NewName\\": \\"lib/mapping.ts\\",
          \\"Dependency Count\\": 0,
          \\"Package Dependencies\\": [],
          \\"dependencies\\": []
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
        "ts-morph-split-packages": Array [],
      }
    `);
  });

  it.todo("test bad config filename");
  it.todo("test bad dependency filename");
});
