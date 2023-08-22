import { defineConfig } from "vitest/config";
import { transform } from "esbuild";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "./src/index.ts",
      },
      formats: ["es", "iife"],
      name: "QrCodeGenerator",
      fileName: (format, entryName) =>
        format === "es" ? `${entryName}.js` : `${entryName}.${format}.js`,
    },
  },
  plugins: [
    {
      name: "minifyEs",
      renderChunk: {
        order: "post",
        async handler(code, _, outputOptions) {
          if (outputOptions.format === "es") {
            return await transform(code, { minify: true });
          }
          return code;
        },
      },
    },
  ],
  test: {
    browser: {
      enabled: true,
      headless: true,
      name: "chromium",
      provider: "playwright",
    },
    coverage: {
      provider: "istanbul",
    },
  },
});
