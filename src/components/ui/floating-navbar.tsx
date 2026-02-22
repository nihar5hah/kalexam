"use client";

import React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

type FloatingNavItem = {
  name: string;
  link: string;
  icon?: React.ReactNode;
};

export const FloatingNav = ({
  navItems,
  className,
  action,
}: {
  navItems: FloatingNavItem[];
  className?: string;
  action?: React.ReactNode;
}) => {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 0,
          y: -16,
        }}
        animate={{
          y: 0,
          opacity: 1,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          "fixed inset-x-0 top-6 z-[5000] mx-auto flex w-fit max-w-[95vw] items-center justify-center gap-2 rounded-full border border-white/20 bg-black/75 px-3 py-2 shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.35),0px_1px_0px_0px_rgba(255,255,255,0.06),0px_0px_0px_1px_rgba(255,255,255,0.1)] backdrop-blur-xl",
          className,
        )}
      >
        {navItems.map((navItem, idx) => (
          <Link
            key={`link=${idx}`}
            href={navItem.link}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-neutral-200 transition hover:text-white",
            )}
          >
            <span className="block sm:hidden">{navItem.icon}</span>
            <span className="hidden text-sm sm:block">{navItem.name}</span>
          </Link>
        ))}
        {action ?? (
          <button className="relative rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white">
            <span>Login</span>
            <span className="absolute inset-x-0 -bottom-px mx-auto h-px w-1/2 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
