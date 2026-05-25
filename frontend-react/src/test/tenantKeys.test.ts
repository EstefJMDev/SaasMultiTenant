import { describe, expect, it } from "vitest";

import { hrKeys } from "@entities/hr";
import { invoiceKeys } from "@entities/invoices";
import { projectKeys } from "@entities/projects";

describe("tenantKeys helper", () => {
  it("keeps hr key shape intact", () => {
    expect(hrKeys.departments(2)).toEqual(["hr", 2, "departments"]);
  });

  it("keeps invoice list key shape intact", () => {
    expect(invoiceKeys.list(2, { a: 1 })).toEqual([
      "invoices",
      2,
      "list",
      { a: 1 },
    ]);
  });

  it("keeps project tasks key shape intact", () => {
    expect(projectKeys.tasks(2, "all")).toEqual([
      "projects",
      2,
      "detail",
      "all",
      "tasks",
    ]);
  });
});
