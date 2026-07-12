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

test("admin can promote employee role", async ({ page }) => {
  let submitted: unknown = null;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const path = (u.pathname + u.search).replace("/api/v1", "");
    if (path === "/auth/me") {
      return route.fulfill({ json: { data: actor, meta: { requestId: "test" } } });
    }
    if (path === "/employees?pageSize=100") {
      return route.fulfill({
        json: {
          data: [
            { id: "employee-1", firstName: "Jane", lastName: "Doe", status: "ACTIVE", roles: [{ role: "EMPLOYEE", departmentId: null }], employeeCode: "EMP-001", email: "jane@assetflow.local" },
          ],
          meta: { requestId: "test", page: 1, pageSize: 25, total: 1 },
        },
      });
    }
    if (u.pathname.replace("/api/v1", "") === "/employees/employee-1/roles" && req.method() === "PUT") {
      submitted = req.postDataJSON();
      return route.fulfill({ json: { data: { success: true }, meta: { requestId: "test" } } });
    }
    return route.fulfill({ json: { data: [], meta: { requestId: "test", page: 1, pageSize: 25, total: 0 } } });
  });

  await page.goto("/organization/employees");
  await page.getByRole("button", { name: "Roles" }).click();
  await page.locator('input[value="ASSET_MANAGER"]').check();
  await page.getByRole("button", { name: "Update roles" }).click();
  await expect.poll(() => submitted).toBeTruthy();
  // The mutation sends the array directly: put(url, roles) where roles is Array<{role}>
  expect(submitted).toContainEqual({ role: "ASSET_MANAGER" });
});

test("double allocation displays conflict error", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const path = (u.pathname + u.search).replace("/api/v1", "");
    const pname = u.pathname.replace("/api/v1", "");
    if (pname === "/auth/me") {
      return route.fulfill({ json: { data: actor, meta: { requestId: "test" } } });
    }
    if (path === "/assets?pageSize=100") {
      return route.fulfill({
        json: {
          data: [{ id: "asset-1", assetTag: "AF-0001", name: "Laptop", status: "AVAILABLE", condition: "GOOD", isBookable: false }],
          meta: { requestId: "test", page: 1, pageSize: 100, total: 1 },
        },
      });
    }
    if (path === "/employees?pageSize=100") {
      return route.fulfill({
        json: {
          data: [{ id: "user-1", firstName: "Aarav", lastName: "Admin" }],
          meta: { requestId: "test", page: 1, pageSize: 100, total: 1 },
        },
      });
    }
    if (pname === "/departments") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (pname === "/allocations" && req.method() === "POST") {
      return route.fulfill({
        status: 409,
        json: { code: "ASSET_ALREADY_ALLOCATED", detail: "Asset is already allocated." },
      });
    }
    return route.fulfill({ json: { data: [], meta: { requestId: "test", page: 1, pageSize: 25, total: 0 } } });
  });

  await page.goto("/allocations");
  await page.getByRole("button", { name: "Allocate asset" }).click();
  // Select by value since option text includes assetTag · name
  await page.getByLabel("Available asset").selectOption({ value: "asset-1" });
  await page.getByLabel("Employee").selectOption({ value: "user-1" });
  await page.getByRole("button", { name: "Allocate", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("Asset is already allocated");
});

test("booking reschedule attempt reaches the API endpoint", async ({ page }) => {
  let rescheduleCalled = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me") {
      return route.fulfill({ json: { data: actor, meta: { requestId: "test" } } });
    }
    if (path === "/bookings") {
      return route.fulfill({
        json: {
          data: [{ id: "booking-1", assetId: "asset-1", title: "Meeting Room A", startAt: "2026-07-20T10:00:00.000Z", endAt: "2026-07-20T11:00:00.000Z", status: "CONFIRMED" }],
          meta: { requestId: "test", page: 1, pageSize: 25, total: 1 },
        },
      });
    }
    if (path === "/bookings/booking-1/reschedule") {
      rescheduleCalled = true;
      return route.fulfill({
        status: 409,
        json: { code: "BOOKING_OVERLAP", detail: "Slot overlaps with an active booking." },
      });
    }
    return route.fulfill({ json: { data: [], meta: { requestId: "test", page: 1, pageSize: 25, total: 0 } } });
  });

  // Handle the two prompt() dialogs for startAt and endAt
  let dialogCount = 0;
  page.on("dialog", async (dialog) => {
    dialogCount++;
    if (dialogCount === 1) await dialog.accept("2026-07-20T12:00:00.000Z");
    else await dialog.accept("2026-07-20T13:00:00.000Z");
  });

  await page.goto("/bookings");
  await page.getByRole("button", { name: "Cancel & rebook" }).click();
  await expect.poll(() => rescheduleCalled).toBe(true);
});

test("complete maintenance lifecycle workflow", async ({ page }) => {
  let stepsCalled: string[] = [];
  let currentStatus = "PENDING";
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me") {
      return route.fulfill({ json: { data: actor, meta: { requestId: "test" } } });
    }
    if (path === "/assets?pageSize=100") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (path === "/employees?pageSize=100") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (path === "/departments") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (path === "/maintenance-requests") {
      return route.fulfill({
        json: {
          data: [{ id: "m-1", assetId: "asset-1", issueDescription: "Printer broken", priority: "HIGH", status: currentStatus, assignedTechnicianUserId: null, createdAt: "2026-07-12T00:00:00Z" }],
          meta: { requestId: "test", page: 1, pageSize: 25, total: 1 },
        },
      });
    }
    if (path === "/maintenance-requests/m-1/approve") {
      stepsCalled.push("approved");
      currentStatus = "APPROVED";
      return route.fulfill({ json: { data: { success: true }, meta: { requestId: "test" } } });
    }
    if (path === "/maintenance-requests/m-1/reject") {
      stepsCalled.push("rejected");
      currentStatus = "REJECTED";
      return route.fulfill({ json: { data: { success: true }, meta: { requestId: "test" } } });
    }
    return route.fulfill({ json: { data: [], meta: { requestId: "test", page: 1, pageSize: 25, total: 0 } } });
  });

  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: "PENDING" })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => stepsCalled).toContain("approved");

  // Reset for reject flow in a fresh context
  stepsCalled = [];
  currentStatus = "PENDING";
  await page.reload();
  await expect(page.getByRole("heading", { name: "PENDING" })).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByLabel("Rejection reason").fill("Not needed");
  await page.getByRole("button", { name: "Reject request" }).click();
  await expect.poll(() => stepsCalled).toContain("rejected");
});

test("audit discrepancy resolution and closure flow", async ({ page }) => {
  let stepsCalled: string[] = [];
  let discrepancyResolved = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me") {
      return route.fulfill({ json: { data: actor, meta: { requestId: "test" } } });
    }
    if (path === "/locations") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (path === "/employees?pageSize=100") {
      return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
    }
    if (path === "/audit-cycles/audit-1") {
      const discrepancies = discrepancyResolved
        ? [{ id: "disc-1", auditItemId: "item-1", type: "MISSING", status: "RESOLVED", details: "Item not found" }]
        : [{ id: "disc-1", auditItemId: "item-1", type: "MISSING", status: "OPEN", details: "Item not found" }];
      return route.fulfill({
        json: {
          data: {
            id: "audit-1",
            code: "AUD-001",
            name: "Summer Audit",
            status: "REVIEW",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
            items: [],
            discrepancies,
          },
          meta: { requestId: "test" },
        },
      });
    }
    if (path === "/audit-discrepancies/disc-1/resolve") {
      stepsCalled.push("resolved");
      discrepancyResolved = true;
      return route.fulfill({ json: { data: { success: true }, meta: { requestId: "test" } } });
    }
    if (path === "/audit-cycles/audit-1/close") {
      stepsCalled.push("closed");
      return route.fulfill({ json: { data: { success: true }, meta: { requestId: "test" } } });
    }
    return route.fulfill({ json: { data: [], meta: { requestId: "test" } } });
  });

  await page.goto("/audits/audit-1");
  await expect(page.getByRole("heading", { name: /Summer Audit/ })).toBeVisible();
  // Resolve the open discrepancy
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect.poll(() => stepsCalled).toContain("resolved");
  // After invalidation the query refetches with discrepancy resolved, enabling "Close audit"
  await expect(page.getByRole("button", { name: "Close audit" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Close audit" }).click();
  await expect.poll(() => stepsCalled).toContain("closed");
});
