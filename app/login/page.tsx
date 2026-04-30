import Link from "next/link";
import { LockKeyhole, Trophy } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 py-10 text-white">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl lg:grid-cols-2">
        <section className="relative hidden min-h-[620px] bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-300 p-10 text-slate-950 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.5),transparent_35%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em]">EstudoTOP</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-tight">Simulados com cara de aprovação.</h1>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-800">
                Plataforma própria para aplicar simulados, corrigir desempenho e entregar uma experiência premium para o aluno.
              </p>
            </div>
            <div className="rounded-3xl bg-slate-950/90 p-6 text-white shadow-2xl">
              <Trophy className="text-amber-300" />
              <p className="mt-4 text-2xl font-semibold">Correção + resultado + IA futura</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">O aluno erra, entende o erro e volta mais forte para a prova.</p>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mx-auto max-w-md py-8">
            <div className="mb-8 inline-flex rounded-2xl bg-white/10 p-3 text-orange-300"><LockKeyhole /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Acesso</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Entrar no sistema</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Nesta primeira base, o login é apenas visual. Depois vamos conectar ao Supabase.</p>

            <form className="mt-8 space-y-4">
              <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="Usuário ou e-mail" />
              <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400" placeholder="Senha" type="password" />
              <Link href="/dashboard" className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01]">Entrar como administrador</Link>
              <Link href="/aluno" className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white transition hover:bg-white/10">Entrar como aluno</Link>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
