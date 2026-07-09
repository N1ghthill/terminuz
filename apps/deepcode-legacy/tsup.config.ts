import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  sourcemap: false,
  external: ["terminuz"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
