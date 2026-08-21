import { defineConfig as createVitestConfig } from "vitest/config";

// Tests in @looper/data cover pure helpers only: agent helpers and the
// upload-protocol core with a fake StorageUploader.
// No Convex runtime is needed, so they run in plain node. The include list stays
// explicit so the heavy Convex/React hook modules are never pulled into the graph.
const dataTestContract = {
  environment: "node",
  globals: true,
  include: [
    "src/agent/**/__tests__/*.{test,spec}.ts",
    "src/adapters/convex/__tests__/dictation-mappers.test.ts",
    "src/adapters/convex/__tests__/upload-protocol.test.ts",
  ],
};

export default createVitestConfig({ test: dataTestContract });
