/**
 * Component coverage for `<PersonHeader>`: PersonData vs IdentityPerson
 * name/subtitle resolution, the fallback-email slot, the null render, and
 * inline (card-less) mode.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IdentityPerson, PersonData } from "@/types/insight";

import { PersonHeader } from "./person-header";

const PERSON: PersonData = {
  person_id: "p-1",
  name: "Jane Doe",
  role: "Engineer",
  seniority: "Senior",
};

function identity(overrides: Partial<IdentityPerson> = {}): IdentityPerson {
  return {
    person_id: "p-2",
    email: "bob@example.com",
    display_name: "Bob Park",
    subordinates: [],
    ...overrides,
  };
}

describe("<PersonHeader>", () => {
  it("renders nothing without a person or fallback email", () => {
    const { container } = render(<PersonHeader person={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders PersonData with role · seniority subtitle and initials", () => {
    render(<PersonHeader person={PERSON} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Engineer · Senior")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("renders role alone when seniority is empty", () => {
    render(<PersonHeader person={{ ...PERSON, seniority: "" }} />);
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });

  it("renders IdentityPerson with job title · department subtitle", () => {
    render(
      <PersonHeader
        person={identity({ job_title: "Developer", department: "Platform" })}
      />,
    );
    expect(screen.getByText("Bob Park")).toBeInTheDocument();
    expect(screen.getByText("Developer · Platform")).toBeInTheDocument();
    expect(screen.getByText("BP")).toBeInTheDocument();
  });

  it("renders IdentityPerson with department only", () => {
    render(<PersonHeader person={identity({ department: "Platform" })} />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
  });

  it("omits the subtitle row when IdentityPerson has neither title nor department", () => {
    const { container } = render(<PersonHeader person={identity()} />);
    expect(screen.getByText("Bob Park")).toBeInTheDocument();
    expect(
      container.querySelectorAll(".text-muted-foreground.truncate"),
    ).toHaveLength(0);
  });

  it("falls back to the email when person is null", () => {
    render(<PersonHeader person={null} fallbackEmail="jane@example.com" />);
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("wraps in a card by default and skips it in inline mode", () => {
    const { container: card } = render(<PersonHeader person={PERSON} />);
    expect(card.querySelector('[data-slot="card"]')).not.toBeNull();

    const { container: inline } = render(
      <PersonHeader person={PERSON} inline />,
    );
    expect(inline.querySelector('[data-slot="card"]')).toBeNull();
  });
});
