import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "b0ed-2600-1700-640-4100-586f-e09e-1c36-b81a.ngrok-free.app"
    ]
  }
});
