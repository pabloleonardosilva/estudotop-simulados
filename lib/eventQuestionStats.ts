export const ACTIVE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

type ActivityAttempt = { status: string; last_activity_at: string | null; started_at: string | null };
export function isActiveEventAttempt(attempt: ActivityAttempt, now: number): boolean {
  return attempt.status === "in_progress" && new Date(attempt.last_activity_at || attempt.started_at || 0).getTime() >= now - ACTIVE_ATTEMPT_WINDOW_MS;
}

type OperationalAttempt = ActivityAttempt & {
  id: string;
  student_id: string;
  event_participant_id: string | null;
  counts_toward_limit: boolean;
  submitted_at: string | null;
  attempt_number: number;
};
type OperationalParticipant = { id: string; student_id: string; representative_attempt_id: string | null };

export function selectEventQuestionAttempts<T extends OperationalAttempt>(participants: OperationalParticipant[], attempts: T[], now: number): T[] {
  const selected = new Map<string, T>();
  for (const participant of [...participants].sort((a, b) => a.id.localeCompare(b.id))) {
    if (selected.has(participant.student_id)) continue;
    const own = attempts.filter((attempt) => attempt.student_id === participant.student_id && attempt.event_participant_id === participant.id);
    const completed = own.filter((attempt) => attempt.status === "completed" && attempt.counts_toward_limit);
    const official = completed.find((attempt) => attempt.id === participant.representative_attempt_id)
      || completed.sort((a, b) => (a.submitted_at || "9999").localeCompare(b.submitted_at || "9999") || a.attempt_number - b.attempt_number || a.id.localeCompare(b.id))[0];
    // A valid official conclusion takes priority over any extra attempt.
    const chosen = official || own.filter((attempt) => isActiveEventAttempt(attempt, now))
      .sort((a, b) => a.attempt_number - b.attempt_number || (a.started_at || "9999").localeCompare(b.started_at || "9999") || a.id.localeCompare(b.id))[0];
    if (chosen) selected.set(participant.student_id, chosen);
  }
  return [...selected.values()].sort((a, b) => a.id.localeCompare(b.id));
}
