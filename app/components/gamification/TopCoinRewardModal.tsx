"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { formatTopCoinsLabel } from "@/app/lib/gamification/topcoins";
import TopCoinStack from "./TopCoinStack";

const FALLING_COINS = [0, 1, 2, 3, 4];

export function TopCoinValueInfo({
  amount,
  className = "",
  dark = false,
  prefix = "Valendo",
}: {
  amount: number;
  className?: string;
  dark?: boolean;
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={className}
        aria-label={`Entender ${formatTopCoinsLabel(amount)} deste simulado`}
      >
        <TopCoinStack size="md" />
        <span>{prefix} {formatTopCoinsLabel(amount)}</span>
      </button>
      {open && createPortal(
        <PremiumModal
          open
          theme={dark ? "dark" : "light"}
          tone="info"
          title="O que são TopCoins?"
          message="TopCoin é a moeda universal do EstudoTOP Simulados. Cada simulado resolvido pode render uma quantidade de TopCoins, e essas moedas futuramente garantirão vantagens dentro da plataforma."
          onClose={() => setOpen(false)}
          closeLabel="Entendi"
        >
          <div className={`flex items-start gap-4 rounded-2xl border p-4 text-sm leading-6 ${dark ? "border-amber-400/25 bg-amber-400/10 text-amber-50" : "border-orange-200 bg-orange-50 text-slate-700"}`}>
            <TopCoinStack size="lg" />
            <p>
              Este simulado vale até <strong>{formatTopCoinsLabel(amount)}</strong> nesta tentativa. Você começa com zero e ganha moedas por acerto: 4 por questão na primeira tentativa, 2 na segunda e 1 da terceira em diante.
            </p>
          </div>
        </PremiumModal>,
        document.body,
      )}
    </>
  );
}

function playTopCoinSound() {
  try {
    const audio = new Audio("/sounds/topcoin-drop.mp3");
    audio.volume = 0.28;
    audio.play().catch(() => {
      // Navegador bloqueou autoplay ou o arquivo ainda não existe; ignora silenciosamente.
    });
  } catch {
    // Ignora erro de áudio — o som é só um extra, nunca deve travar a recompensa.
  }
}

export default function TopCoinRewardModal({
  amount,
  open,
  onClose,
}: {
  amount: number;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (open) playTopCoinSound();
  }, [open]);

  return (
    <PremiumModal
      open={open}
      theme="dark"
      tone="success"
      dismissible={false}
      title={`Você ganhou ${formatTopCoinsLabel(amount)}`}
      message={
        amount > 0
          ? "Continue acumulando mérito rumo à aprovação."
          : "Continue praticando: cada acerto pode render TopCoins na próxima tentativa."
      }
      onClose={onClose}
      closeLabel="Ver resultado"
    >
      <div className="relative mx-auto h-40 w-full max-w-xs" style={{ perspective: 1000 }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-2 mx-auto h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.45),transparent_70%)] blur-xl"
        />

        <motion.div
          className="absolute left-1/2 top-2 h-20 w-20 -translate-x-1/2"
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateY: 0, scale: 0.85 }}
          animate={{ rotateY: 720, scale: [0.85, 1.12, 1] }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/top-coin-frente.png"
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ backfaceVisibility: "hidden" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/top-coin-verso.png"
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          />
        </motion.div>

        {FALLING_COINS.map((index) => (
          <motion.img
            key={index}
            src="/images/top-coin-frente.png"
            alt=""
            aria-hidden
            className="absolute top-0 h-6 w-6 object-contain"
            style={{ left: `${30 + index * 9}%` }}
            initial={{ opacity: 0, y: -40, rotate: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-40, 70, 90], rotate: [0, 280, 340], scale: [0.7, 1, 0.85] }}
            transition={{ duration: 1.3, delay: 0.3 + index * 0.12, ease: "easeOut" }}
          />
        ))}
      </div>
    </PremiumModal>
  );
}
