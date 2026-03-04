import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "f8de-2600-1700-640-4100-15e3-9d27-a27a-9cfd.ngrok-free.app"
    ]
  }
});
