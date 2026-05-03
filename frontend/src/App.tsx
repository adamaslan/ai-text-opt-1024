import { useState } from "react";
import ChatPage from "./pages/ChatPage";
import PredictionsPage from "./pages/PredictionsPage";

// Top-level page discriminant — extend this union to add new pages without
// restructuring the router. Each page is lazy-rendered (not pre-mounted).
type Page = "chat" | "predictions";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("chat");

  return (
    <div className="app">
      <nav className="app-nav">
        <button
          className={`nav-btn ${currentPage === "chat" ? "active" : ""}`}
          onClick={() => setCurrentPage("chat")}
        >
          💬 Chat
        </button>
        <button
          className={`nav-btn ${currentPage === "predictions" ? "active" : ""}`}
          onClick={() => setCurrentPage("predictions")}
        >
          📊 Predictions
        </button>
      </nav>
      {currentPage === "chat" ? <ChatPage /> : <PredictionsPage />}
    </div>
  );
}
