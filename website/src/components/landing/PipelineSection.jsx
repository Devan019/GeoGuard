"use client";

import Reveal from "@/components/landing/Reveal";

export default function PipelineSection({ steps }) {
  return (
    <section id="pipeline" className="px-6 pb-20 pt-8 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,30,0.95),rgba(7,11,21,0.98))] p-7 sm:p-10">
        <Reveal>
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">Pipeline Flow</h2>
          <p className="mt-3 max-w-2xl text-[#9db0d0]">
            End-to-end orchestration from raw imagery to compliance-aware geospatial insight.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-3">
          {steps.map((step, index) => (
            <Reveal
              key={step}
              delay={index * 0.035}
              className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/2 px-4 py-3"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#39d6b7]/20 text-xs font-semibold text-[#89f0dc]">
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed text-[#c4d1eb]">{step}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
