import { describe, expect, it } from "vitest";

import { normalizeTask } from "../src/utils/config";

describe("public task configuration", () => {
  it("contains only the public Cookie scheduler fields", () => {
    const task = normalizeTask({
      name: "公开任务",
      targetPageUrl: "https://example.com/"
    });

    expect(Object.keys(task).sort()).toEqual([
      "closeTabAfterCapture",
      "cookieCaptureEnabled",
      "cookieCaptureMode",
      "cookieNames",
      "createdAt",
      "enabled",
      "id",
      "name",
      "pageLoadWaitMs",
      "scheduleMinutes",
      "targetPageUrl",
      "updatedAt"
    ]);
  });
});
