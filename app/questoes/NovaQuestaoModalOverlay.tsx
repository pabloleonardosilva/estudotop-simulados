"use client";

import NewQuestionModal from "../components/questions/NewQuestionModal";

export default function NovaQuestaoModalOverlay({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  if (!show) return null;

  return <NewQuestionModal onClose={onClose} />;
}
