import { ToastContainer } from "react-toastify";
import AllRoutes from "./Routes/AllRoutes";
import TravelAssistant from "./Components/AI/TravelAssistant";
import { ThemeProvider, useTheme } from "./context/ThemeContext";

function Toasts() {
  const { theme } = useTheme();
  return <ToastContainer position="top-center" autoClose={3200} theme={theme} limit={3} newestOnTop />;
}

export default function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <AllRoutes />
        <Toasts />
        <TravelAssistant />
      </div>
    </ThemeProvider>
  );
}
