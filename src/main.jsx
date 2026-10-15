import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./app/styles/index.css"
import App from "./app/App.jsx"
import { AuthProvider } from "./app/context/AuthContext.jsx"
import { ToastProvider } from "./app/context/ToastContext.jsx"
import { initTheme } from "./lib/theme"

initTheme()

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
)