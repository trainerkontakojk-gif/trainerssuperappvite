import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initAuth } from "./store/authInit";
import { Toaster } from "sonner";
import "./index.css";

initAuth();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        theme="system"
        richColors
        expand={false}
        visibleToasts={3}
        closeButton
        duration={4000}
      />
    </ErrorBoundary>
  </React.StrictMode>,
);
