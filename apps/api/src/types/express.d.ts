declare global {
  namespace Express {
    interface Request {
      requestId: string;
      actor?: {
        id: string;
        organizationId: string;
        email: string;
        firstName: string;
        lastName: string | null;
        primaryDepartmentId: string | null;
        roles: Array<{ role: "EMPLOYEE" | "ADMIN" | "ASSET_MANAGER" | "DEPARTMENT_HEAD"; departmentId: string | null }>;
      };
    }
  }
}
export {};
