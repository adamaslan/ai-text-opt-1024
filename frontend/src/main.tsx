import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Global CSS must be imported here (not inside a component) so Vite processes
// it once and injects it before any component renders.
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
