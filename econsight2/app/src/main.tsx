// app/src/main.tsx
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// debug log
console.log("[main.tsx] running, Buffer:", typeof Buffer);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);