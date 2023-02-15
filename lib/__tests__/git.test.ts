/**
 *
 * Tests for lib\git.ts
 *
 */
import { checkoutTempSimpleRepo, loadSimpleMadge } from "./test_fixtures";
import * as sut from "../git";
describe("prepareGitMove", () => {
  it("Expect to not log errors in console", () => {
    const spy = jest.spyOn(global.console, "error");
    const m = loadSimpleMadge();
    sut.prepareGitMove(m);
    expect(spy).not.toHaveBeenCalled();
  });
  it("Should run and match the snapshot", () => {
    const m = loadSimpleMadge();
    const result = sut.prepareGitMove(m);
    expect(result).toMatchSnapshot();
  });
  it("should move some files to new, and leave others", () => {
    const m = loadSimpleMadge();
    const result = sut.prepareGitMove(m);
    const newRepo = result.get("new");
    expect(newRepo).toBeDefined();
    expect(newRepo).toContainEqual(["dist/bundle.d.ts", "src/bundle.d.ts"]);
    expect(newRepo).not.toContainEqual(["lib/index.ts", expect.any(String)]);
  });
});
describe("executeGitMoveForRepo", () => {
  const tempRepo = checkoutTempSimpleRepo();

  const spy = jest.spyOn(global.console, "error");
  const m = loadSimpleMadge();
  const plan = sut.prepareGitMove(m).get("new");
  expect(plan).toBeDefined();
  expect(spy).not.toHaveBeenCalled();

  it("Execute default plan", async () => {
    const results = await sut.executeGitMoveForRepo(await tempRepo, "new", plan!, m);
    expect(results).toMatchSnapshot();
  });
});
