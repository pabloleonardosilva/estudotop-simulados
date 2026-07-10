import { listLogs } from "@/lib/logging/admin-log-query";

export async function GET(request: Request) {
  return listLogs(request, "system_error_logs");
}
