"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, Clock, Zap, BookOpen, Target, XCircle, FileText, Files, Presentation, History, Timer, Home, ListChecks, Sparkles } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { HeroSection } from "@/components/HeroSection";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { Variants } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { KalExamLogo } from "@/components/KalExamLogo";

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function KalExamLanding() {
  const router = useRouter();
  const { user } = useAuth();
  const navItems = [
    { name: "Home", url: "#home", icon: Home },
    { name: "How It Works", url: "#how-it-works", icon: ListChecks },
    { name: "Features", url: "#features", icon: Sparkles },
  ];

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  if (user) {
    return null;
  }

  return (
    // Enforcing Apple system fonts, sleek dark mode background
    <div
      className="min-h-screen bg-[#050505] text-white selection:bg-orange-500/20 overflow-hidden relative"
    >
      <NavBar items={navItems} className="sm:mt-2" />

      {/* Brand anchor — top left */}
      <div className="fixed top-[18px] left-6 z-50">
        <KalExamLogo size="sm" />
      </div>

      {/* Aurora Moving Background */}
      <AuroraBackground />

      <div id="home" className="max-w-7xl mx-auto px-6 pt-28 pb-24 relative z-10 space-y-28">
        <div className="absolute top-8 right-6 z-20">
          {user ? (
            <UserMenu />
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild type="button" size="sm" variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
                <Link href="/auth">Sign In</Link>
              </Button>
              <Button asChild type="button" size="sm" className="rounded-full bg-white text-black hover:bg-neutral-200">
                <Link href="/auth">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>

        {/* 1. HERO SECTION */}
        <HeroSection fadeIn={fadeIn} />

        {/* 2. HOW IT WORKS */}
        <motion.section
          id="how-it-works"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="flex flex-col items-center space-y-16 relative"
        >
          {/* Section ambient glow — right side amber */}
          <div aria-hidden className="pointer-events-none hidden md:block absolute right-[-15%] top-[20%] w-[520px] h-[420px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(245,158,11,0.11) 0%, transparent 68%)", filter: "blur(90px)" }} />

          <motion.div variants={fadeIn} className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">How it works</h2>
            <p className="text-neutral-400 max-w-xl mx-auto font-light">Three simple steps to transform your last-minute panic into a clear, actionable plan.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {[
              { icon: Upload, title: "Upload syllabus & notes", desc: "Drag and drop your PDFs or docs. We extract the key topics instantly.", iconClass: "bg-white/8 border-white/10", textClass: "text-neutral-300" },
              { icon: Clock, title: "Tell us your time", desc: "Have 5 hours or 5 days? We adapt the session to your available time.", iconClass: "bg-white/8 border-white/10", textClass: "text-neutral-300" },
              { icon: Zap, title: "Get session instantly", desc: "Receive a prioritized plan telling you exactly what to study and what to skip.", iconClass: "bg-white/8 border-white/10", textClass: "text-neutral-300" }
            ].map((step, i) => (
              <motion.div key={i} variants={fadeIn}>
                {/* Liquid Glass Effect Card */}
                <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl hover:bg-white/10 transition-all duration-300 shadow-lg md:shadow-2xl rounded-3xl h-full flex flex-col p-2">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border mb-4 shadow-inner ${step.iconClass}`}>
                      <step.icon className={`w-6 h-6 ${step.textClass}`} />
                    </div>
                    <CardTitle className="text-xl font-medium tracking-tight text-white">{step.title}</CardTitle>
                    <CardDescription className="text-neutral-400 text-sm leading-relaxed pt-2">
                      {step.desc}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="features"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="space-y-10 relative"
        >
          {/* Section ambient glow — left side orange */}
          <div aria-hidden className="pointer-events-none hidden md:block absolute left-[-12%] top-[15%] w-[460px] h-[460px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.10) 0%, transparent 65%)", filter: "blur(100px)" }} />

          <motion.div variants={fadeIn} className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Now smarter with exam intelligence
            </h2>
            <p className="text-neutral-400 max-w-2xl mx-auto font-light">
              KalExam now combines your notes, syllabus, and previous papers for better last-minute decisions.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                icon: Files,
                title: "Multiple file uploads",
                desc: "Upload multiple syllabus and study files in one go.",
                iconClass: "bg-white/8 border-white/10",
                iconTextClass: "text-neutral-300",
              },
              {
                icon: Presentation,
                title: "Supports PDFs & PPTs",
                desc: "Understands PDF, DOCX, PPT and PPTX formats.",
                iconClass: "bg-white/8 border-white/10",
                iconTextClass: "text-neutral-300",
              },
              {
                icon: History,
                title: "Uses previous papers",
                desc: "Detects repeated topics from past-year papers.",
                iconClass: "bg-white/8 border-white/10",
                iconTextClass: "text-neutral-300",
              },
              {
                icon: Timer,
                title: "Time-based session",
                desc: "Prioritizes topics around your exact time left.",
                iconClass: "bg-white/8 border-white/10",
                iconTextClass: "text-neutral-300",
              },
            ].map((feature, index) => (
              <motion.div key={index} variants={fadeIn}>
                <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-lg md:shadow-2xl rounded-3xl h-full">
                  <CardHeader>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 border ${feature.iconClass}`}>
                      <feature.icon className={`w-5 h-5 ${feature.iconTextClass}`} />
                    </div>
                    <CardTitle className="text-white text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-neutral-400">{feature.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* 3. WHAT YOU GET */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
          className="space-y-16 relative"
        >
          {/* Section ambient glow — bottom right warm */}
          <div aria-hidden className="pointer-events-none hidden md:block absolute right-[-8%] bottom-[5%] w-[560px] h-[480px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.09) 0%, transparent 62%)", filter: "blur(120px)" }} />
          {/* Section ambient glow — top left amber */}
          <div aria-hidden className="pointer-events-none hidden md:block absolute left-[-6%] top-[0%] w-[380px] h-[300px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(245,158,11,0.07) 0%, transparent 70%)", filter: "blur(80px)" }} />

          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">What you get</h2>
            <p className="text-neutral-400 max-w-xl mx-auto font-light">Everything you need to maximize your score in minimum time.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-lg md:shadow-2xl rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500"><Target className="w-32 h-32" /></div>
              <CardHeader className="relative z-10 pb-2">
                <Badge className="w-fit mb-4 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border-none px-3 py-1">High ROI</Badge>
                <CardTitle className="text-2xl font-medium text-white">High priority topics</CardTitle>
                <CardDescription className="text-neutral-400">The 20% of topics that yield 80% of the marks.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-lg md:shadow-2xl rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500"><BookOpen className="w-32 h-32" /></div>
              <CardHeader className="relative z-10 pb-2">
                <Badge className="w-fit mb-4 bg-white/10 text-neutral-300 hover:bg-white/15 border-none px-3 py-1">Step-by-step</Badge>
                <CardTitle className="text-2xl font-medium text-white">Study order</CardTitle>
                <CardDescription className="text-neutral-400">A logical progression plan from basics to complex concepts.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-lg md:shadow-2xl rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500"><XCircle className="w-32 h-32" /></div>
              <CardHeader className="relative z-10 pb-2">
                <Badge className="w-fit mb-4 bg-red-500/20 text-red-300 hover:bg-red-500/30 border-none px-3 py-1">Time savers</Badge>
                <CardTitle className="text-2xl font-medium text-white">Low ROI topics to skip</CardTitle>
                <CardDescription className="text-neutral-400">Stop wasting time on hard concepts that rarely appear on the exam.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-lg md:shadow-2xl rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500"><FileText className="w-32 h-32" /></div>
              <CardHeader className="relative z-10 pb-2">
                <Badge className="w-fit mb-4 bg-white/10 text-neutral-300 hover:bg-white/15 border-none px-3 py-1">Ready to go</Badge>
                <CardTitle className="text-2xl font-medium text-white">Exam session report</CardTitle>
                <CardDescription className="text-neutral-400">A downloadable PDF cheatsheet of your complete prep plan.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </motion.section>

        {/* 4. TRUST SECTION */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
          className="py-16 text-center relative"
        >
          {/* Subtle center pulse */}
          <div aria-hidden className="pointer-events-none hidden md:flex absolute inset-0 items-center justify-center">
            <div className="w-[680px] h-[180px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.07) 0%, transparent 70%)", filter: "blur(70px)" }} />
          </div>
          <div className="max-w-3xl mx-auto space-y-3 relative z-10">
            <h3 className="text-2xl md:text-3xl font-semibold text-white">
              Built for real last-minute exam preparation.
            </h3>
            <p className="text-neutral-400">
              KalExam analyzes your syllabus, notes, and past papers to create a focused study plan.
            </p>
          </div>
        </motion.section>

        {/* 5. FINAL CTA SECTION */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
          className="relative max-w-4xl mx-auto text-center py-20 px-12 overflow-hidden rounded-[3rem]"
        >
          {/* Liquid glass base for CTA wrapper */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-sm md:backdrop-blur-2xl border border-white/10" />
          {/* Inner warm CTA glow */}
          <div aria-hidden className="pointer-events-none hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] rounded-full" style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.10) 0%, rgba(245,158,11,0.04) 55%, transparent 80%)", filter: "blur(60px)" }} />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />

          <div className="relative z-10 space-y-8 flex flex-col items-center">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-tight">
              Stop guessing.<br />Start strategizing.
            </h2>
            <Button
              asChild
              size="lg"
              className="rounded-full bg-white text-black hover:bg-neutral-200 px-10 py-7 text-lg font-medium transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)]"
            >
              <Link href="/upload">Start Preparing</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/10 bg-white/5 backdrop-blur-sm md:backdrop-blur-lg hover:bg-white/10 text-white px-8 py-6 text-base font-medium transition-all"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </motion.section>

        <footer className="border-t border-white/10 pt-10 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <KalExamLogo size="sm" linked={false} />
              <p className="text-sm text-neutral-400">AI exam prep built for last-minute students.</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-neutral-400">
              <Link href="#" className="hover:text-white transition-colors">About</Link>
              <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="#" className="hover:text-white transition-colors">Contact</Link>
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-6">© {new Date().getFullYear()} KalExam. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
