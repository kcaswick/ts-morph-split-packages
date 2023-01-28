import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const { default: packageJson } = await import("./package.json", { assert: { type: "json" } });

export default [
  {
    input: "dist/index.js",
    output: [
      {
        file: packageJson.main,
        format: "cjs",
        sourcemap: true,
      },
      {
        file: packageJson.module,
        format: "esm",
        sourcemap: true,
      },
    ],
    plugins: [resolve(), commonjs(), typescript({ tsconfig: "./tsconfig.json" })],
  },
  {
    input: "dist/index.d.ts",
    output: [{ file: "dist/bundle.d.ts", format: "esm" }],
    plugins: [dts()],
  },
];
