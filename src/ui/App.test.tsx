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

  it("drop area has aria-disabled", () => {
    const html = renderToStaticMarkup(React.createElement(App));
    expect(html).toContain('aria-disabled="true"');
  });

  it("button is disabled", () => {
    const html = renderToStaticMarkup(React.createElement(App));
    expect(html).toContain(" disabled");
  });
});
