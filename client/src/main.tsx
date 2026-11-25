import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../vendor/paper/elements/index.js";
import "../vendor/paper/packs/ai-connections.esm.js";
import "./styles/app.css";
import App from "./App";
import { queryClient } from "./lib/api";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
