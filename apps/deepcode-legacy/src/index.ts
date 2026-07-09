import process from "node:process";

process.stderr.write(
  "DeepCode is now Terminuz. Install the new package with `npm install -g terminuz` and use the `terminuz` command.\n",
);

await import("terminuz/cli");
