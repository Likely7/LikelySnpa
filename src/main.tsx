import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./contexts/I18nContext";
import "./index.css";

const windowType = new URLSearchParams(window.location.search).get("windowType") || "";
if (
	windowType === "hud-overlay" ||
	windowType === "source-selector" ||
	windowType === "countdown-overlay"
) {
	document.body.style.background = "transparent";
	document.documentElement.style.background = "transparent";
	document.getElementById("root")?.style.setProperty("background", "transparent");
} else if (windowType === "settings") {
	document.body.style.background = "#08090c";
	document.documentElement.style.background = "#08090c";
	document.getElementById("root")?.style.setProperty("background", "#08090c");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<I18nProvider>
			<App />
		</I18nProvider>
	</React.StrictMode>,
);
