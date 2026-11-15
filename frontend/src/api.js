// Where the backend lives. In dev, "/api" goes through the Vite proxy (vite.config.js), which
// works from a phone on the same Wi-Fi too. At deploy (Week 6), set VITE_API_URL to the backend's URL.
export const API = import.meta.env.VITE_API_URL ?? "/api";
