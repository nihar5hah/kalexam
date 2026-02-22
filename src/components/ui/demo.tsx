"use client";

import React from "react";
import { Home, MessageSquare, User } from "lucide-react";

import { FloatingNav } from "@/components/ui/floating-navbar";
import { NotFound } from "@/components/ui/not-found-2";
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave";

export function FloatingNavDemo() {
  const navItems = [
    {
      name: "Home",
      link: "/",
      icon: <Home className="h-4 w-4 text-neutral-500 dark:text-white" />,
    },
    {
      name: "About",
      link: "/about",
      icon: <User className="h-4 w-4 text-neutral-500 dark:text-white" />,
    },
    {
      name: "Contact",
      link: "/contact",
      icon: <MessageSquare className="h-4 w-4 text-neutral-500 dark:text-white" />,
    },
  ];

  return (
    <div className="relative w-full">
      <FloatingNav navItems={navItems} />
      <DummyContent />
    </div>
  );
}

const DummyContent = () => {
  return (
    <div className="relative grid h-[80rem] w-full grid-cols-1 rounded-md border border-neutral-200 bg-white dark:border-white/20 dark:bg-black">
      <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform text-center text-4xl font-bold text-neutral-600 dark:text-white">
        Scroll back up to reveal Navbar
      </p>
      <div className="absolute inset-0 bg-grid-black/10 dark:bg-grid-white/20" />
    </div>
  );
};
import SearchComponent from "@/components/ui/animated-glowing-search-bar";

const DemoOne = () => {
  return <SearchComponent />;
};

export { DemoOne };

export function TextShimmerWaveBasic() {
  return (
    <TextShimmerWave className="font-mono text-sm" duration={1}>
      Generating code...
    </TextShimmerWave>
  );
}

export function NotFoundDemo() {
  return <NotFound />;
}
