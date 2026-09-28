import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "PrivSight",
    description: "Privacy-before-network browser agent",
    version: "0.1.1",
    minimum_chrome_version: "116",
    permissions: ["activeTab", "tabs", "scripting", "storage", "sidePanel", "offscreen"],
    host_permissions: ["https://aryan-shastri--privsight-qwen3-vl-api.modal.run/*"],
    side_panel: { default_path: "sidepanel.html" },
    action: { default_title: "Open PrivSight" },
    // wasm-unsafe-eval permits packaged ORT WASM compilation; remote script origins remain forbidden.
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  },
});
