import * as ort from "onnxruntime-web/webgpu";

export type VisionProvider = "webgpu" | "wasm";
export interface SessionFactory {
  create(model: string | Uint8Array, options: { executionProviders: VisionProvider[] }): Promise<{ run(feeds: unknown): Promise<unknown> }>;
}

function assertPackagedPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error("REMOTE_MODEL_FORBIDDEN");
  if (!path.endsWith(".onnx")) throw new Error("INVALID_MODEL_PATH");
}

export async function createLocalVisionSession(
  packagedModelPath: string | Uint8Array,
  factory: SessionFactory = ort.InferenceSession as unknown as SessionFactory,
  webGpuAvailable: boolean = typeof navigator !== "undefined" && "gpu" in navigator,
): Promise<{ provider: VisionProvider; session: Awaited<ReturnType<SessionFactory["create"]>> }> {
  if (typeof packagedModelPath === "string") assertPackagedPath(packagedModelPath);
  const failures: string[] = [];
  for (const provider of (webGpuAvailable ? ["webgpu", "wasm"] : ["wasm"]) as VisionProvider[]) {
    try {
      const session = await factory.create(packagedModelPath, { executionProviders: [provider] });
      if (provider === "wasm") return { provider, session };
      const result: { provider: VisionProvider; session: { run(feeds: unknown): Promise<unknown> } } = {
        provider,
        session: { run: async feeds => {
          try { return await session.run(feeds); }
          catch (gpuError) {
            try {
              const wasm = await factory.create(packagedModelPath, { executionProviders: ["wasm"] });
              result.provider = "wasm"; result.session = wasm;
              return await wasm.run(feeds);
            } catch (wasmError) {
              throw new Error(`LOCAL_INFERENCE_UNAVAILABLE:webgpu:${gpuError instanceof Error ? gpuError.message : "unknown"};wasm:${wasmError instanceof Error ? wasmError.message : "unknown"}`);
            }
          }
        } },
      };
      return result;
    } catch (error) {
      failures.push(`${provider}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  throw new Error(`LOCAL_INFERENCE_UNAVAILABLE:${failures.join(";")}`);
}

export async function loadVerifiedLocalModel(url: string, expectedSha256: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (!url.startsWith("chrome-extension://") || !url.endsWith(".onnx")) throw new Error("REMOTE_MODEL_FORBIDDEN");
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("INVALID_MODEL_HASH");
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error("MODEL_LOAD_FAILURE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  if (digest !== expectedSha256) throw new Error("MODEL_INTEGRITY_FAILURE");
  return bytes;
}

export function configurePackagedWasmPaths(extensionRoot: string): void {
  if (!extensionRoot.startsWith("chrome-extension://")) throw new Error("REMOTE_RUNTIME_FORBIDDEN");
  ort.env.wasm.wasmPaths = `${extensionRoot.replace(/\/$/, "")}/wasm/`;
}
