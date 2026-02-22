"use client";

import { motion } from "framer-motion";

import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { RequireAuth } from "@/components/RequireAuth";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <RequireAuth redirectTo="/upload">
      <div className="min-h-screen bg-[#050505] text-white selection:bg-orange-500/20 overflow-hidden relative">
        <AuthenticatedNavBar />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.1, 0.05] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-[10%] left-[10%] w-[70%] h-[60%] rounded-full bg-orange-500/[0.06] blur-[160px]"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 md:pt-28 md:pb-28 flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-center space-y-3"
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400 pb-2">
              Build your last-minute plan
            </h1>
            <p className="text-neutral-400 text-base md:text-lg">
              Upload your PDFs, choose your model, and generate your KalExam session.
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
