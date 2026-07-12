import { expect, test, type Page } from "@playwright/test";
const actor = {
  id: "user-1",
  organizationId: "org-1",
  email: "admin@assetflow.local",
  firstName: "Aarav",
  lastName: "Admin",
  primaryDepartmentId: null,
  roles: [
    { role: "EMPLOYEE", departmentId: null },
    { role: "ADMIN", departmentId: null },
    { role: "ASSET_MANAGER", departmentId: null },
  ],
};
async function mockApi(page: Page) {
  let authenticated = false;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    if (path === "/auth/me")
      return route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated
          ? { data: actor, meta: { requestId: "test" } }
          : { code: "AUTHENTICATION_REQUIRED" },
      });
    if (path === "/auth/login") {
      authenticated = true;
      return route.fulfill({
        json: { data: actor, meta: { requestId: "test" } },
      });
    }
    if (path === "/dashboard/summary")
      return route.fulfill({
        json: {
          data: {
            kpis: {
              available: 4,
              allocated: 1,
              maintenanceToday: 2,
              activeBookings: 1,
              pendingTransfers: 1,
              upcomingReturns: 0,
            },
            overdueReturns: 1,
            recentActivity: [],
          },
          meta: { requestId: "test" },
        },
      });
    return route.fulfill({
      json: {
        data: [],
        meta: { requestId: "test", page: 1, pageSize: 25, total: 0 },
      },
    });
  });
}
test("login exposes role-aware navigation and live dashboard cards", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Good morning" }),
  ).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Setup/ })).toBeVisible();
});
test("maintenance route renders the required five workflow columns", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Maintenance/ }).click();
  for (const column of [
    "PENDING",
    "APPROVED",
    "TECHNICIAN ASSIGNED",
    "IN PROGRESS",
    "RESOLVED",
  ])
    await expect(page.getByRole("heading", { name: column })).toBeVisible();
});
test("asset managers can review a pending return with condition and notes", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me" || path === "/auth/login")
      return route.fulfill({
        json: { data: actor, meta: { requestId: "test" } },
      });
    if (path.startsWith("/assets"))
      return route.fulfill({
        json: {
          data: [
            {
              id: "asset-1",
              assetTag: "AF-0002",
              name: "Design Laptop",
              status: "ALLOCATED",
              condition: "GOOD",
              isBookable: false,
            },
          ],
          meta: { requestId: "test" },
        },
      });
    if (path === "/allocations")
      return route.fulfill({
        json: {
          data: [
            {
              id: "allocation-1",
              assetId: "asset-1",
              allocatedToUserId: "user-2",
              allocatedToDepartmentId: null,
              allocatedAt: "2026-07-01T00:00:00.000Z",
              expectedReturnAt: null,
              endedAt: null,
              checkoutCondition: "GOOD",
            },
          ],
          meta: { requestId: "test" },
        },
      });
    if (path === "/return-requests")
      return route.fulfill({
        json: {
          data: [
            {
              id: "return-1",
              allocationId: "allocation-1",
              status: "PENDING",
              proposedCondition: "FAIR",
              requestNotes: "Ready for check-in",
              createdAt: "2026-07-12T00:00:00.000Z",
            },
          ],
          meta: { requestId: "test" },
        },
      });
    return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
  });
  await page.goto("/allocations");
  await expect(
    page.getByRole("heading", { name: "Pending return approvals" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(
    page.getByRole("dialog", { name: "Approve return" }),
  ).toBeVisible();
  await expect(page.getByLabel("Check-in condition")).toHaveValue("FAIR");
});
test("asset registration renders and submits required typed category fields", async ({
  page,
}) => {
  const categoryId = "00000000-0000-4000-8000-000000000401";
  const fieldId = "00000000-0000-4000-8000-000000000411";
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me")
      return route.fulfill({
        json: { data: actor, meta: { requestId: "test" } },
      });
    if (path === "/categories")
      return route.fulfill({
        json: {
          data: [
            { id: categoryId, code: "ROOM", name: "Room", status: "ACTIVE" },
          ],
          meta: { requestId: "test" },
        },
      });
    if (path === `/categories/${categoryId}/fields`)
      return route.fulfill({
        json: {
          data: [
            {
              id: fieldId,
              fieldKey: "capacity",
              label: "Capacity",
              fieldType: "INTEGER",
              isRequired: true,
              optionsJson: null,
              validationJson: null,
              status: "ACTIVE",
              sortOrder: 0,
            },
          ],
          meta: { requestId: "test" },
        },
      });
    if (path === "/assets" && route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: { data: { id: "asset-1" }, meta: { requestId: "test" } },
      });
    }
    if (path === "/assets/asset-1")
      return route.fulfill({
        json: {
          data: {
            id: "asset-1",
            assetTag: "AF-0007",
            name: "Training Room",
            status: "AVAILABLE",
            condition: "GOOD",
            categoryId,
            currentLocationId: null,
            owningDepartmentId: null,
            serialNumber: null,
            isBookable: true,
            version: 1,
            createdAt: "2026-07-12T00:00:00Z",
          },
          meta: { requestId: "test" },
        },
      });
    return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
  });
  await page.goto("/assets/new");
  await page.getByLabel("Asset name").fill("Training Room");
  await page.getByLabel("Category").selectOption(categoryId);
  await page.getByLabel("Capacity").fill("12");
  await page.getByRole("button", { name: "Register asset" }).click();
  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted?.fields).toEqual([
    { fieldDefinitionId: fieldId, value: 12 },
  ]);
});
