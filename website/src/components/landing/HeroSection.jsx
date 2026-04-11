"use client";

import Reveal from "@/components/landing/Reveal";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";

const EarthScene = dynamic(() => import("@/components/landing/EarthScene"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] w-full animate-pulse rounded-3xl border border-white/10 bg-[#05080f] sm:h-[460px]" />
  ),
});

export default function HeroSection({ content }) {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-14 sm:px-10 sm:pt-20 lg:px-14">
      <div className="absolute -left-24 top-14 h-56 w-56 rounded-full bg-[#0fbf9f]/20 blur-3xl" />
      <div className="absolute right-8 top-10 h-48 w-48 rounded-full bg-[#2c6eff]/20 blur-3xl" />

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <Reveal>
          <div className="space-y-6">
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="inline-flex items-center rounded-full border border-[#2ec4a6]/35 bg-[#102126] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#78e9d0]"
            >
              {content.badge} • {content.status}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 }}
              className="text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl"
            >
              {content.title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
              className="max-w-xl text-pretty text-base leading-relaxed text-[#bac6e0] sm:text-lg"
            >
              {content.subtitle}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              className="flex flex-col gap-3 pt-1 sm:flex-row"
            >
              <Link
                href={content.ctaPrimary.href}
                className="inline-flex items-center justify-center rounded-xl border border-[#39d6b7] bg-[#39d6b7] px-5 py-3 text-sm font-semibold text-[#052019] transition hover:bg-[#56ebcd]"
              >
                {content.ctaPrimary.label}
              </Link>
              <a
                href={content.ctaSecondary.href}
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
              >
                {content.ctaSecondary.label}
              </a>
            </motion.div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <EarthScene />
        </Reveal>
      </div>
    </section>
  );
}
