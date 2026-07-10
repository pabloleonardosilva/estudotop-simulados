export {
  requireAdmin,
  requireAdminPage,
  requireStudentPage,
} from "@/lib/server/authGuard";

export type { AuthAdmin, AuthenticatedStudentPage } from "@/lib/server/authGuard";
