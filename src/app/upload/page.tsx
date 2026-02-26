"use client";

import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { RequireAuth } from "@/components/RequireAuth";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <RequireAuth redirectTo="/upload">
      <div className="min-h-screen bg-[#050505] text-white selection:bg-orange-500/20 overflow-hidden relative">
        <AuthenticatedNavBar />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] left-[10%] w-[70%] h-[60%] rounded-full bg-orange-500/[0.06] blur-[110px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 md:pt-28 md:pb-28 flex flex-col items-center gap-8">
          <div className="text-center space-y-3">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400 pb-2">
              Build your last-minute plan
            </h1>
            <p className="text-neutral-400 text-base md:text-lg">
              Upload your PDFs, choose your model, and generate your KalExam session.
            </p>
          </div>

          <div className="w-full flex justify-center">
            <UploadForm />
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
