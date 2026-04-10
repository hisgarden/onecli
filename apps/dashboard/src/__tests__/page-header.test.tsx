import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "../components/page-header";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Agents" />);
    expect(screen.getByText("Agents")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    render(<PageHeader title="Secrets" description="Manage your secrets" />);
    expect(screen.getByText("Manage your secrets")).toBeTruthy();
  });
});
