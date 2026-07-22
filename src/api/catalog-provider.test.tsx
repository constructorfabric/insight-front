import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCatalog = vi.fn(() => ({ data: undefined }));
vi.mock("@/api/use-catalog", () => ({
  useCatalog: () => useCatalog(),
}));

let tenantId: string | null = null;
vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    session: tenantId ? { tenantId } : null,
  }),
}));

import { CatalogProvider } from "@/api/catalog-provider";

function renderProvider(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <CatalogProvider>
        <span>child</span>
      </CatalogProvider>
    </QueryClientProvider>,
  );
}

describe("CatalogProvider", () => {
  beforeEach(() => {
    useCatalog.mockClear();
    tenantId = null;
  });

  it("does not prefetch without a tenant", () => {
    const { getByText } = renderProvider(new QueryClient());
    expect(getByText("child")).toBeInTheDocument();
    expect(useCatalog).not.toHaveBeenCalled();
  });

  it("prefetches the catalog when a tenant is present", () => {
    tenantId = "t1";
    renderProvider(new QueryClient());
    expect(useCatalog).toHaveBeenCalled();
  });

  it("evicts catalog queries only on a real tenant transition", () => {
    const client = new QueryClient();
    const removeQueries = vi.spyOn(client, "removeQueries");

    tenantId = "t1";
    const view = render(
      <QueryClientProvider client={client}>
        <CatalogProvider>
          <span>child</span>
        </CatalogProvider>
      </QueryClientProvider>,
    );
    expect(removeQueries).not.toHaveBeenCalled();

    tenantId = "t2";
    view.rerender(
      <QueryClientProvider client={client}>
        <CatalogProvider>
          <span>child</span>
        </CatalogProvider>
      </QueryClientProvider>,
    );
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["catalog"] });

    removeQueries.mockClear();
    tenantId = null;
    view.rerender(
      <QueryClientProvider client={client}>
        <CatalogProvider>
          <span>child</span>
        </CatalogProvider>
      </QueryClientProvider>,
    );
    expect(removeQueries).not.toHaveBeenCalled();
  });
});
