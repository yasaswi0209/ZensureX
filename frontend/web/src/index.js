import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/theme.css";
import "./styles/zensurex-extra.css";
const root = ReactDOM.createRoot(
  document.getElementById("root")
);

root.render(<App />);

document.addEventListener("mousemove", (e) => {

  document.body.style.setProperty(
    "--x",
    e.clientX + "px"
  );

  document.body.style.setProperty(
    "--y",
    e.clientY + "px"
  );

});
