import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  dts: true,
  sourcemap: true,
  noExternal: [/^@deepcode\//],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
