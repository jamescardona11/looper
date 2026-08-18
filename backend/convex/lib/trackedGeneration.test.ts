import { describe, expect, it, vi } from "vitest";
import { runTrackedGeneration } from "./trackedGeneration";

describe("runTrackedGeneration", () => {
  it("creates, executes, completes, and returns the completed result", async () => {
    const calls: string[] = [];

    const result = await runTrackedGeneration({
      create: async () => {
        calls.push("create");
        return "generation-id";
      },
      execute: async () => {
        calls.push("execute");
        return "provider-output";
      },
      complete: async (id, output) => {
        calls.push(`complete:${id}:${output}`);
        return { id, output };
      },
      fail: async () => {
        calls.push("fail");
      },
    });

    expect(result).toEqual({ id: "generation-id", output: "provider-output" });
    expect(calls).toEqual(["create", "execute", "complete:generation-id:provider-output"]);
  });

  it("marks the generation failed and rethrows the original error", async () => {
    const error = new Error("provider failed");
    const fail = vi.fn(async () => undefined);

    await expect(
      runTrackedGeneration({
        create: async () => "generation-id",
        execute: async () => {
          throw error;
        },
        complete: async () => "done",
        fail,
      }),
    ).rejects.toBe(error);

    expect(fail).toHaveBeenCalledWith("generation-id", "provider failed");
  });

  it("normalizes non-Error failures", async () => {
    const fail = vi.fn(async () => undefined);

    await expect(
      runTrackedGeneration({
        create: async () => "generation-id",
        execute: async () => {
          throw "failed";
        },
        complete: async () => "done",
        fail,
      }),
    ).rejects.toBe("failed");

    expect(fail).toHaveBeenCalledWith("generation-id", "Unknown error");
  });

  it("does not call fail when creation itself fails", async () => {
    const fail = vi.fn(async () => undefined);

    await expect(
      runTrackedGeneration({
        create: async () => {
          throw new Error("create failed");
        },
        execute: async () => "output",
        complete: async () => "done",
        fail,
      }),
    ).rejects.toThrow("create failed");

    expect(fail).not.toHaveBeenCalled();
  });
});
