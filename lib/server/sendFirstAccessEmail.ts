import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { studentWelcomeTemplate } from "@/lib/email/studentWelcomeTemplate";
import { addHours, generateSecureToken, hashRegistrationValue } from "@/lib/security/registrationTokens";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";
const FIRST_ACCESS_EXPIRATION_HOURS = 24;

function getAppUrl(request?: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || (request ? new URL(request.url).origin : "http://localhost:3001");
}

export async function sendFirstAccessEmail(studentId: string, request?: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY não foi configurada.");
  }

  const supabase = createSupabaseAdminClient();

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, name, email, cpf, phone, desired_contests")
    .eq("id", studentId)
    .single();

  if (studentError || !student?.email) {
    throw new Error(studentError?.message || "Aluno não encontrado ou sem e-mail.");
  }

  const rawToken = generateSecureToken();
  const firstAccessUrl = `${getAppUrl(request)}/primeiro-acesso?token=${rawToken}`;

  await supabase
    .from("student_registration_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", studentId)
    .eq("purpose", "first_access")
    .is("used_at", null);

  const { error: tokenError } = await supabase.from("student_registration_confirmations").insert({
    purpose: "first_access",
    user_id: studentId,
    full_name: student.name || student.email,
    email: student.email,
    phone: student.phone || null,
    cpf: student.cpf || null,
    desired_contests: student.desired_contests || null,
    token_hash: hashRegistrationValue(rawToken),
    desired_status: "active",
    expires_at: addHours(FIRST_ACCESS_EXPIRATION_HOURS),
    metadata: { source: "first_access" },
  });

  if (tokenError) throw new Error(tokenError.message);

  const resend = new Resend(resendApiKey);
  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: student.email,
    subject: "Defina sua senha — EstudoTOP Simulados",
    html: studentWelcomeTemplate({
      studentName: student.name || "Aluno",
      email: student.email,
      firstAccessUrl,
      expiresInHours: FIRST_ACCESS_EXPIRATION_HOURS,
    }),
  });

  if (emailError) throw new Error(emailError.message);

  await supabase
    .from("students")
    .update({
      welcome_email_status: "sent",
      welcome_email_sent_at: new Date().toISOString(),
      welcome_email_error: null,
    })
    .eq("id", studentId);

  return { firstAccessUrl };
}
