"use client";

import Reveal from "@/components/landing/Reveal";

export default function FeaturesSection({ items }) {
  return (
    <section className="px-6 py-16 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">Core Features</h2>
          <p className="mt-3 max-w-2xl text-[#9db0d0]">
            A production-ready geospatial stack from satellite acquisition to policy-aligned compliance decisions.
          </p>
        </Reveal>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((feature, index) => (
            <Reveal
              key={feature.title}
              delay={index * 0.05}
              className="group rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(16,22,36,0.82),rgba(8,13,22,0.95))] p-6 transition hover:border-[#39d6b7]/40"
            >
              <div className="mb-3 h-1.5 w-10 rounded-full bg-[#39d6b7]/80 transition group-hover:w-14" />
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a7b7d4]">
                {feature.description}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
