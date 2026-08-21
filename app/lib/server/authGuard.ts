export {
  requireAdmin,
  requireAdminPage,
  requireEventManager,
  requireProfessor,
  requireProfessorPage,
  requireStudentPage,
} from "@/lib/server/authGuard";

export type { AuthAdmin, AuthProfessor, AuthenticatedStudentPage } from "@/lib/server/authGuard";
