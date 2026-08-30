import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import App from "./App";

describe("App", () => {
  it("renders without throwing", () => {
    expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();
  });

  it("contains the title 'Hindsight'", () => {
    const html = renderToStaticMarkup(React.createElement(App));
    expect(html).toContain("Hindsight");
  });

  it("integrates the prescriptions screen with the bundled baseline", () => {
    const html = renderToStaticMarkup(React.createElement(App));
    expect(html).toContain("Corrected configuration, ready to copy.");
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html).toContain("Docker MCP Server");
  });

  it("states that processing stays in the browser", () => {
    const html = renderToStaticMarkup(React.createElement(App));
    expect(html).toContain("The file never leaves this browser");
  });
});
