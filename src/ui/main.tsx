import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    "Could not find #root element. Check index.html for <div id=\"root\">."
  );
}

createRoot(rootElement).render(<App />);
