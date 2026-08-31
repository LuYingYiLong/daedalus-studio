import { createRoot } from "react-dom/client";
import "@/ui/styles/theme.css";
import ComputerOverlay from "@/widgets/computer-observation/ComputerOverlay";

createRoot(document.getElementById("root")!).render(<ComputerOverlay />);
