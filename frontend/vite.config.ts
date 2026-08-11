import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Lets you write `import { api } from "@/lib/api"` instead of
    // "../../../lib/api". Must be mirrored in tsconfig paths.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5173 },
});
