export interface OffscreenApi {
  hasDocument(): Promise<boolean>;
  createDocument(): Promise<void>;
}

let creation: Promise<void> | undefined;

/** Ensures the required host exists; call before every compute request because MV3 may tear it down. */
export function ensureOffscreenHost(api: OffscreenApi): Promise<void> {
  if (creation) return creation;
  creation = (async () => {
    if (!(await api.hasDocument())) await api.createDocument();
  })().finally(() => { creation = undefined; });
  return creation;
}

export function chromeOffscreenApi(): OffscreenApi {
  const url = browser.runtime.getURL("/offscreen.html" as never);
  return {
    hasDocument: async () => {
      const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as never], documentUrls: [url] });
      return contexts.length > 0;
    },
    createDocument: () => browser.offscreen.createDocument({
      url,
      reasons: ["WORKERS"],
      justification: "Run packaged local privacy and vision workers",
    }),
  };
}
