import { describe, it, expect, vi } from "vitest";
import { createSingleFlight } from "./dedupe";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("las llamadas concurrentes reutilizan la misma ejecucion en curso", async () => {
    const factory = vi.fn();
    const first = deferred<string>();
    factory.mockReturnValueOnce(first.promise);

    const run = createSingleFlight(factory);

    const call1 = run();
    const call2 = run();
    const call3 = run();

    expect(factory).toHaveBeenCalledTimes(1);

    first.resolve("ok");
    await expect(call1).resolves.toBe("ok");
    await expect(call2).resolves.toBe("ok");
    await expect(call3).resolves.toBe("ok");
  });

  it("una nueva llamada tras resolverse la anterior dispara una ejecucion nueva", async () => {
    const factory = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const run = createSingleFlight(factory);

    await expect(run()).resolves.toBe("first");
    await expect(run()).resolves.toBe("second");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("tras un rechazo, la siguiente llamada reintenta con una ejecucion nueva", async () => {
    const factory = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("recovered");
    const run = createSingleFlight(factory);

    await expect(run()).rejects.toThrow("boom");
    await expect(run()).resolves.toBe("recovered");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("las llamadas concurrentes durante un rechazo tambien lo reciben todas", async () => {
    const failure = deferred<string>();
    const factory = vi.fn().mockReturnValueOnce(failure.promise);
    const run = createSingleFlight(factory);

    const call1 = run();
    const call2 = run();

    failure.reject(new Error("network down"));

    await expect(call1).rejects.toThrow("network down");
    await expect(call2).rejects.toThrow("network down");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
