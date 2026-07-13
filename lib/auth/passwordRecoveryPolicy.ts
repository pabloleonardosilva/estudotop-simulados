export function isApprovedStudentForPasswordRecovery(
  student: { status?: string | null; approved_at?: string | null } | null,
  profile: { role?: string | null; is_active?: boolean | null } | null,
) {
  return Boolean(student?.status === "active" && student.approved_at && profile?.role === "student" && profile.is_active);
}
