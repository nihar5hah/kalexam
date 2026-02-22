"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type HeroSectionProps = {
  fadeIn: Variants;
};

export function HeroSection({ fadeIn }: HeroSectionProps) {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      className="flex flex-col items-center text-center space-y-8"
    >
      <Badge
        variant="outline"
        className="px-4 py-1.5 rounded-full border-white/10 bg-white/5 backdrop-blur-md text-sm text-neutral-400"
      >
        ✨ Now supports PPT & multiple files
      </Badge>

      <h1 className="text-6xl md:text-8xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-200 to-neutral-500 pb-4 px-4 leading-tight">
        Exam kal hai?
        <br />
        We got you.
      </h1>

      <p className="text-lg md:text-xl text-neutral-400 max-w-2xl font-light tracking-wide -mt-4">
        Upload your syllabus, notes, and past papers. Get a personalized exam session.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 pt-6">
        <Button
          asChild
          size="lg"
          className="rounded-full bg-orange-500 hover:bg-orange-400 text-white px-8 py-6 text-base font-medium transition-all shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:shadow-[0_0_40px_rgba(249,115,22,0.5)]"
        >
          <Link href="/upload">
            Start Preparing <ChevronRight className="ml-2 w-4 h-4" />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="rounded-full border-white/15 bg-white/5 backdrop-blur-lg hover:bg-white/8 text-neutral-300 px-8 py-6 text-base font-medium transition-all"
        >
          <a href="#how-it-works">See how it works</a>
        </Button>
      </div>
    </motion.section>
  );
}
