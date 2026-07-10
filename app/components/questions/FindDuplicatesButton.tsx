"use client";

import Link from "next/link";
import { CopyCheck } from "lucide-react";
import PremiumButton from "../ui/PremiumButton";

export default function FindDuplicatesButton() {
  return (
    <Link href="/questoes/duplicatas">
      <PremiumButton variant="secondary" icon={<CopyCheck size={16} />}>
        Encontrar duplicatas
      </PremiumButton>
    </Link>
  );
}
