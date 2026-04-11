import FeaturesSection from "@/components/landing/FeaturesSection";
import HeroSection from "@/components/landing/HeroSection";
import PipelineSection from "@/components/landing/PipelineSection";
import ProblemSolutionSection from "@/components/landing/ProblemSolutionSection";
import {
  features,
  pipelineFlow,
  problemAndSolution,
  projectContent,
} from "@/data/landingContent";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#02050b]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(34,206,170,0.12),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(60,109,242,0.16),transparent_35%),linear-gradient(180deg,#02050b_0%,#030712_100%)]" />

      <main className="relative z-10">
        <HeroSection content={projectContent} />
        <ProblemSolutionSection content={problemAndSolution} />
        <FeaturesSection items={features} />
        <PipelineSection steps={pipelineFlow} />
      </main>
    </div>
  );
}
