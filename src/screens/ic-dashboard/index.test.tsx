import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityPerson } from "@/types/insight";

let personData: IdentityPerson | undefined;
let v2Enabled = false;

vi.mock("@/queries/ic-dashboard", () => ({
  useIcPerson: () => ({ data: personData }),
}));

vi.mock("@/lib/feature-flags", () => ({
  useMetricsV2Enabled: () => v2Enabled,
}));

vi.mock("./sales-dashboard", () => ({
  SalesDashboard: ({
    personId,
    person,
  }: {
    personId: string;
    person?: IdentityPerson | null;
  }) => (
    <div data-testid="sales" data-person={person?.display_name ?? ""}>
      {personId}
    </div>
  ),
}));

vi.mock("./engineering-dashboard-v2", () => ({
  EngineeringDashboardV2: ({ personId }: { personId: string }) => (
    <div data-testid="eng-v2">{personId}</div>
  ),
}));

vi.mock("./engineering-dashboard", () => ({
  EngineeringDashboard: ({ personId }: { personId: string }) => (
    <div data-testid="eng-v1">{personId}</div>
  ),
}));

import { IcDashboardScreen } from "./index";

function person(department?: string): IdentityPerson {
  return {
    person_id: "p@x.io",
    email: "p@x.io",
    display_name: "Pat",
    department,
    subordinates: [],
  } as unknown as IdentityPerson;
}

beforeEach(() => {
  personData = undefined;
  v2Enabled = false;
});

describe("IcDashboardScreen", () => {
  it("routes sales-department people to the sales dashboard, forwarding the person", () => {
    personData = person("Inside Sales");
    v2Enabled = true; // sales wins over the v2 flag

    render(<IcDashboardScreen personId="p@x.io" />);

    expect(screen.getByTestId("sales")).toHaveTextContent("p@x.io");
    expect(screen.getByTestId("sales")).toHaveAttribute("data-person", "Pat");
    expect(screen.queryByTestId("eng-v2")).not.toBeInTheDocument();
  });

  it("routes to the v2 engineering dashboard when the flag is on", () => {
    personData = person("Engineering");
    v2Enabled = true;

    render(<IcDashboardScreen personId="p@x.io" />);

    expect(screen.getByTestId("eng-v2")).toHaveTextContent("p@x.io");
    expect(screen.queryByTestId("sales")).not.toBeInTheDocument();
    expect(screen.queryByTestId("eng-v1")).not.toBeInTheDocument();
  });

  it("falls back to the v1 engineering dashboard with the flag off and no person yet", () => {
    render(<IcDashboardScreen personId="p@x.io" />);

    expect(screen.getByTestId("eng-v1")).toHaveTextContent("p@x.io");
    expect(screen.queryByTestId("sales")).not.toBeInTheDocument();
    expect(screen.queryByTestId("eng-v2")).not.toBeInTheDocument();
  });
});
