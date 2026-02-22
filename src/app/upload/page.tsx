"use client";

import { motion } from "framer-motion";

import { AppTopNav } from "@/components/AppTopNav";
import { RequireAuth } from "@/components/RequireAuth";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <RequireAuth redirectTo="/upload">
      <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
        <AppTopNav />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/20 blur-[120px]"
          />
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute top-[30%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-[120px]"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 md:pt-28 md:pb-28 flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-center space-y-3"
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-300 to-[#050505] pb-2">
              Build your last-minute plan
            </h1>
            <p className="text-neutral-400 text-base md:text-lg">
              Upload your PDFs, choose your model, and generate your KalExam strategy.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="w-full flex justify-center"
          >
            <UploadForm />
          </motion.div>
        </div>
      </div>
    </RequireAuth>
  );
}
