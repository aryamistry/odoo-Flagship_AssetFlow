import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import "./styles.css";

const queryClient = new QueryClient();

function App() {
  return <main className="center"><section className="welcome"><p className="eyebrow">Enterprise asset operations</p><h1>AssetFlow</h1><p>The application foundation is ready.</p><a className="button" href="/api/v1/health">Check API health</a></section></main>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></React.StrictMode>);

