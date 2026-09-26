import { useState } from "react";
import ChatPage from "./pages/ChatPage";
import GrowthPage from "./pages/GrowthPage";
import PredictionsPage from "./pages/PredictionsPage";
import SuperAppPage from "./pages/SuperAppPage";
import SwingPage from "./pages/SwingPage";

// Top-level page discriminant — extend this union to add new pages without
// restructuring the router. Each page is lazy-rendered (not pre-mounted).
type Page = "super" | "chat" | "predictions" | "swing" | "growth";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("super");

  return (
    <div className="app">
      <nav className="app-nav">
        <button
          className={`nav-btn ${currentPage === "super" ? "active" : ""}`}
          onClick={() => setCurrentPage("super")}
        >
          AI Alpha OS
        </button>
        <button
          className={`nav-btn ${currentPage === "chat" ? "active" : ""}`}
          onClick={() => setCurrentPage("chat")}
        >
          Trader Chat
        </button>
        <button
          className={`nav-btn ${currentPage === "predictions" ? "active" : ""}`}
          onClick={() => setCurrentPage("predictions")}
        >
          Predictions
        </button>
        <button
          className={`nav-btn ${currentPage === "swing" ? "active" : ""}`}
          onClick={() => setCurrentPage("swing")}
        >
          Swing Ideas
        </button>
        <button
          className={`nav-btn ${currentPage === "growth" ? "active" : ""}`}
          onClick={() => setCurrentPage("growth")}
        >
          Growth Ideas
        </button>
      </nav>
      {currentPage === "super" && <SuperAppPage />}
      {currentPage === "chat" && <ChatPage />}
      {currentPage === "predictions" && <PredictionsPage />}
      {currentPage === "swing" && <SwingPage />}
      {currentPage === "growth" && <GrowthPage />}
    </div>
  );
}
