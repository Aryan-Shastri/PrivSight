import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const expected = [
  ["privsight-ui6.onnx", 9017538, "0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9"],
  ["text_detection_en_ppocrv3_2023may.onnx", 2423490, "03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587"],
  ["version-RFB-320.onnx", 1270727, "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017"],
];
const root = resolve(process.cwd(), process.argv[2] === "output" ? ".output/chrome-mv3/models" : "public/models");
for (const [name, bytes, hash] of expected) {
  const path = resolve(root, name); const info = await stat(path); const data = await readFile(path);
  if (info.size !== bytes || createHash("sha256").update(data).digest("hex") !== hash) throw new Error(`MODEL_MANIFEST_MISMATCH:${name}`);
}
console.log(`verified ${expected.length} packaged models (${expected.reduce((sum, item) => sum + Number(item[1]), 0)} bytes)`);
