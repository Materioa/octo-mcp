import React from "react";
import ReactDOM from "react-dom/client";
import { init } from "@squircle/core";
import App from "./App";
import "./index.css";

init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
