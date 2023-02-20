import simpleGit, { CheckRepoActions } from "simple-git";

import { MapResult, PackageMapping } from "../mapping";
import * as morph from "../morph";
import {
  checkoutTempSimpleRepo,
  createTemporaryRepository,
  loadSimpleMadge,
} from "./test_fixtures";

describe("test morph", function () {
  it("test morph.prepareTsMorph", async function () {
    const mapping = loadSimpleMadge();
    await morph.prepareTsMorph(mapping);
  });
});
