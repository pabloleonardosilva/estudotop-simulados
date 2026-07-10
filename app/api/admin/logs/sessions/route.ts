import { listLogs } from "@/lib/logging/admin-log-query";

export async function GET(request: Request) {
  return listLogs(request, "user_sessions");
}
