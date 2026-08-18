import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.stubEnv("VITE_CONVEX_URL", "https://test.convex.cloud");
