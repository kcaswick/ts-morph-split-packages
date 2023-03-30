import { jest } from "@jest/globals";
import expect from "expect";
import { Expect, MatcherState } from "expect/build/types";

import { MapResult } from "../index";

expect.extend({
  toBeMapResult: <jest.CustomMatcher>((received: MapResult): jest.CustomMatcherResult => {
    const pass: boolean = (this as unknown as jest.MatcherContext)?.equals(
      received,
      expect.objectContaining({
        isMapped: expect.any(Function),
        isUnmapped: expect.any(Function),
        toString: expect.any(Function),
      } as Record<keyof MapResult, unknown>)
    );
    return {
      message: () =>
        `expected ${(this as unknown as jest.MatcherContext).utils.printReceived(received)} ${
          pass ? `not ` : ``
        }to be a MapResult`,
      pass,
    };
  }),
});

declare module "expect" {
  interface AsymmetricMatchers {
    toBeMapResult(): void;
  }
  interface Matchers<R, T = unknown> extends jest.Matchers<R, T> {
    toBeMapResult(): R;
  }
}

const expectExport: Expect<MatcherState> & {
  toBeMapResult?: jest.CustomAsymmetricMatcher<jest.CustomMatcher>;
} = expect;

export { expectExport as expect };
