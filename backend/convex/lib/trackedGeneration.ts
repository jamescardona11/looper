export type TrackedGeneration<TId, TOutput, TResult> = {
  create: () => Promise<TId>;
  execute: () => Promise<TOutput>;
  complete: (id: TId, output: TOutput) => Promise<TResult>;
  fail: (id: TId, error: string) => Promise<void>;
};

export async function runTrackedGeneration<TId, TOutput, TResult>({
  create,
  execute,
  complete,
  fail,
}: TrackedGeneration<TId, TOutput, TResult>): Promise<TResult> {
  const id = await create();

  try {
    const output = await execute();
    return await complete(id, output);
  } catch (error) {
    await fail(id, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
