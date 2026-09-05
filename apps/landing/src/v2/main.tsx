import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LandingV2 } from "./landing-v2";
import "../styles/index.css";
import "./v2.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LandingV2 />
  </StrictMode>,
);
