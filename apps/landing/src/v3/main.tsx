import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LandingV3 } from "./landing-v3";
import "../styles/experiments.css";
import "../v2/recovered-sections.css";
import "./v3.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LandingV3 />
  </StrictMode>,
);
