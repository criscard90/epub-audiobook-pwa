import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "EPUB Audiobook",
        short_name: "EPUB Audiobook",
        description: "Trasforma i tuoi EPUB in audiolibri. 100% lato client, offline-first, zero costi.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        id: "/",
        icons: [
          {
            src: "/public/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "/public/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
        file_handlers: [
          {
            action: "/",
            accept: {
              "application/epub+zip": [".epub"],
            },
          },
        ],
        lang: "it",
      },
    }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});