import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-vue"],
  srcDir: "src",
  outDir: "output",
  dev: {
    server: {
      port: 3012
    }
  },
  manifest: {
    name: "Auto Submit Config",
    description: "定时打开用户指定页面并采集该站点 Cookie。",
    permissions: ["alarms", "cookies", "storage", "tabs"],
    host_permissions: ["<all_urls>"]
  }
});
