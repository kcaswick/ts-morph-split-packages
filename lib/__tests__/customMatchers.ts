import { expect, jest } from "@jest/globals";

import { MapResult } from "../index";

export const toBeMapResult: jest.CustomMatcher = (
  received: MapResult
): jest.CustomMatcherResult => {
  const pass: boolean = this.equals(
    received,
    expect.objectContaining({
      isMapped: expect.any(Function),
      isUnmapped: expect.any(Function),
      toString: expect.any(Function),
    } as Record<keyof MapResult, unknown>)
  );
  return {
    message: () =>
      `expected ${this.utils.printReceived(received)} ${pass ? `not ` : ``}to be a MapResult`,
    pass,
  };
};

expect.extend({
  toBeMapResult,
});

declare module "expect" {
  interface AsymmetricMatchers {
    toBeMapResult(): void;
  }
  interface Matchers<R> {
    toBeMapResult(): R;
  }
}
