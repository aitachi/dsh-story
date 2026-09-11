import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.client.{ts,tsx}"],
  },
  esbuild: {
    jsx: "automatic",
  },
});
