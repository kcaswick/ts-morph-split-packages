/// <reference types="jest" />
// X import assert from "assert";

// import { expect } from "@jest/globals";
import { createWriteStream /* , mkdirSync */ } from "fs";
// X import {cruise} from "dependency-cruiser";
import shell from "shelljs";
import { promisify } from "util";

// X import zx, { fs } from "zx";
import { IMapResult, MapResult, PackageMapping } from "../index";

describe("complex repository tests", () => {
  const complexConfigPath = "lib/__tests__/dependency-cruiser/PackageMap.json";
  const complexDependenciesPath = "lib/__tests__/dependency-cruiser/dc-dc.json";

  it("generate dependency-cruiser test data", async () => {
    // X const r = cruise(["../../../dependency-cruiser"], {});
    const originalWorkingDirectory = process.cwd();
    // X mkdirSync("lib/__tests__/dependency-cruiser");

    shell.cd("../dependency-cruiser");
    // X zx.cd("../dependency-cruiser");
    const depcruise =
      // X await zx.$`npx depcruise src --include-only "^src" --config --output-type json`;
      shell.exec('npx depcruise src --include-only "^src" --config --output-type json', {
        silent: true,
      });

    shell.cd(originalWorkingDirectory);

    // X zx.cd(originalWorkingDirectory);
    // X const dependencies = m.obj();
    expect(depcruise.stdout).toBeDefined();
    expect(depcruise.stdout).not.toBe("");

    const s = createWriteStream(complexDependenciesPath, {
      flags: "w+",
    });
    try {
      const dependenciesJson = depcruise.stdout;
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

  function load() {
    const m = new PackageMapping();
    m.getPackageMap(complexDependenciesPath, complexConfigPath);
    return m;
  }

  // Not sure why MapResult.prototype is not working for sampleMapResult, so had to instantiate it instead
  const sampleMapResult = new MapResult({} as unknown as IMapResult);
  const mapResultMatcher = {
    isMapped: sampleMapResult.isMapped,
    isUnmapped: sampleMapResult.isUnmapped,
    toString: sampleMapResult.toString,
  } as Record<keyof MapResult, unknown>;

  it("test loading generated data", () => {
    const m = load();
    // Filter methods out of snapshots
    // https://jestjs.io/docs/en/snapshot-testing#property-matchers
    expect(m).toMatchSnapshot<PackageMapping>({
      depMap: m.depMap.map((x) => ({
        Name: mapResultMatcher,
        dependencyMap: new Array(x.dependencyMap.length).fill(mapResultMatcher),
      })) as unknown as PackageMapping["depMap"],
    });
  });

  it("test mapPackage", () => {
    const m = load();
    const result = m.mapPackage("src/cli/index.js");
    expect(result).toBeDefined();
    expect(result?.Path).toBe("packages/cli/index.js");
    expect(result).toMatchObject({
      Path: "packages/cli/index.js",
      Repo: "dependency-cruiser",
      Package: "dependency-cruiser-cli",
    });
  });

  it("test Export", () => {
    const m = load();
    const result = m.export();
    expect(result).toMatchSnapshot();
  });

  it("test export package dependencies", () => {
    const m = load();
    const result = m.exportPackageDependenciesChart();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "N/A": Array [],
        "dependency-cruiser-cache": Array [
          "dependency-cruiser-extract",
          "dependency-cruiser-utl",
          "dependency-cruiser-graph-utl",
        ],
        "dependency-cruiser-cli": Array [
          "dependency-cruiser-main",
          "dependency-cruiser-config-utl",
          "dependency-cruiser-utl",
          "(unmapped)",
          "dependency-cruiser-extract",
        ],
        "dependency-cruiser-config-utl": Array [
          "dependency-cruiser-extract",
          "dependency-cruiser-main",
          "(unmapped)",
        ],
        "dependency-cruiser-enrich": Array [
          "dependency-cruiser-validate",
          "dependency-cruiser-graph-utl",
          "dependency-cruiser-utl",
        ],
        "dependency-cruiser-extract": Array [
          "(unmapped)",
          "dependency-cruiser-utl",
          "dependency-cruiser-graph-utl",
        ],
        "dependency-cruiser-graph-utl": Array [],
        "dependency-cruiser-main": Array [
          "dependency-cruiser-cache",
          "dependency-cruiser-enrich",
          "dependency-cruiser-extract",
          "dependency-cruiser-schema",
          "dependency-cruiser-utl",
          "dependency-cruiser-report",
          "dependency-cruiser-graph-utl",
        ],
        "dependency-cruiser-report": Array [
          "dependency-cruiser-graph-utl",
          "dependency-cruiser-utl",
          "(unmapped)",
        ],
        "dependency-cruiser-schema": Array [],
        "dependency-cruiser-utl": Array [],
        "dependency-cruiser-validate": Array [
          "dependency-cruiser-utl",
        ],
      }
    `);
  });

  it.todo("test bad config filename");
  it.todo("test bad dependency filename");
});
