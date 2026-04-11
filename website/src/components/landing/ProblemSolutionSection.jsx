"use client";

import Reveal from "@/components/landing/Reveal";

export default function ProblemSolutionSection({ content }) {
  return (
    <section className="px-6 py-16 sm:px-10 lg:px-14">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <Reveal className="rounded-2xl border border-[#ff7a7a]/25 bg-[linear-gradient(160deg,rgba(255,68,68,0.16),rgba(13,8,17,0.7))] p-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#ffadad]">
            The Problem
          </p>
          <h2 className="mb-3 text-2xl font-semibold text-white">Monitoring is too slow</h2>
          <p className="leading-relaxed text-[#f6ced2]">{content.problem}</p>
        </Reveal>

        <Reveal
          delay={0.08}
          className="rounded-2xl border border-[#4fd9be]/30 bg-[linear-gradient(160deg,rgba(18,158,133,0.18),rgba(8,17,26,0.75))] p-7"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#8debd7]">
            The Solution
          </p>
          <h2 className="mb-3 text-2xl font-semibold text-white">GeoGuard automates the loop</h2>
          <p className="leading-relaxed text-[#bcefe4]">{content.solution}</p>
        </Reveal>
      </div>
    </section>
  );
}
