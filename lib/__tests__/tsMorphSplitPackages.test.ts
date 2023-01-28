import assert from "assert";
import { createWriteStream, writeFile } from "fs";
import madge from "madge";
import { PackageMapping } from "../index.js";

describe("tsMorphSplitPackages basic tests", () => {
  it("generate simpleMadgeTestData", async () => {
    // Let process = $`madge --ts-config tsconfig.json --extensions ts,tsx,js,jsx --warning --basedir . lib/index.ts ./dist/cjs/index.cjs dist/esm/index.mjs ./dist/index.js ./dist/index.d.ts ./dist/bundle.d.ts --json | tee lib/__tests__/simpleMadgeTestData/selfMadge.json`;
    // let process = $`   --json | tee lib/__tests__`;
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
    console.warn(m.warnings);

    const dependencies = m.obj;

    // WriteFile("./simpleMadgeTestData/selfMadge.json", JSON.stringify(dependencies));

    const s = createWriteStream("./simpleMadgeTestData/selfMadge.json");
    s.write(JSON.stringify(dependencies), (err) => {
      if (err) {
        console.error(err);
      }

      s.close();
    });
  });
});
