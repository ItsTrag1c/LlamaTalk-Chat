import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import AssistantApp from "./AssistantApp";
import { getCurrentWindow } from "@tauri-apps/api/window";

const windowLabel = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {windowLabel === "llama-assistant" ? <AssistantApp /> : <App />}
  </React.StrictMode>,
);
