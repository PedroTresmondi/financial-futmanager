import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: "index.html",
                admin: "admin.html",
                dashboard: "dashboard.html",
                "estoque-manual": "estoque-manual.html"
            }
        }
    },
    server: {
        proxy: {
            "/api": "http://localhost:3000"
        }
    }
});
