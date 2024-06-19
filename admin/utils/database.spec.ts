import { expect, test } from "vitest";
import { transformPartialUpdates } from "./database";

test("should transform deep properties to simple updates", () => {
  expect(
    transformPartialUpdates("root", { a: { b: 3, c: 4 }, d: { e: 5 } }),
  ).toEqual({ "root/a/b": 3, "root/a/c": 4, "root/d/e": 5 });
});

test("should not transform updates deeper than 2nd level", () => {
  expect(transformPartialUpdates("root", { a: { b: { c: 3 } } })).toEqual({
    "root/a/b": { c: 3 },
  });
});

test("should support deleting parameters", () => {
  expect(transformPartialUpdates("root", { a: null })).toEqual({
    "root/a": null,
  });
});

test("should support deleting nested parameters", () => {
  expect(transformPartialUpdates("root", { a: { b: null } })).toEqual({
    "root/a/b": null,
  });
});
