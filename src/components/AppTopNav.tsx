"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, Upload, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { UserMenu } from "@/components/UserMenu";
import { cn } from "@/lib/utils";

type AppTopNavProps = {
  strategyId?: string | null;
  topicSlug?: string | null;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  visible: boolean;
};

export function AppTopNav({ strategyId, topicSlug }: AppTopNavProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, visible: true },
    { label: "Upload", href: "/upload", icon: <Upload className="h-4 w-4" />, visible: true },
    {
      label: "Strategy",
      href: strategyId ? `/strategy?id=${strategyId}` : "/strategy",
      icon: <BookOpen className="h-4 w-4" />,
      visible: true,
    },
    {
      label: "Study",
      href:
        strategyId && topicSlug
          ? `/study/${encodeURIComponent(topicSlug)}?id=${strategyId}`
          : "/strategy",
      icon: <BookOpen className="h-4 w-4" />,
      visible: Boolean(strategyId && topicSlug),
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href.split("?")[0] ?? href);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/30">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="hidden font-semibold tracking-tight text-white sm:inline-block">
              KalExam
            </span>
          </Link>

          <nav className="flex items-center gap-1 md:gap-2">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "text-white"
                        : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="app-nav-active"
                        className="absolute inset-0 rounded-full bg-white/10 border border-white/10"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {item.icon}
                      <span className="hidden md:inline-block">{item.label}</span>
                    </span>
                  </Link>
                );
              })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
