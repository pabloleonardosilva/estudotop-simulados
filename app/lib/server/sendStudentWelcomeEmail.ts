import { sendFirstAccessEmail } from "@/lib/server/sendFirstAccessEmail";

export async function sendStudentWelcomeEmail(studentId: string) {
  await sendFirstAccessEmail(studentId);
  return true;
}
