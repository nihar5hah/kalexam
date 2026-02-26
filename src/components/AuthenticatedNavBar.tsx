"use client";

import { LayoutDashboard, Settings, Upload } from "lucide-react";

import { UserMenu } from "@/components/UserMenu";
import { NavBar } from "@/components/ui/tubelight-navbar";

type AuthenticatedNavBarProps = {
  strategyId?: string | null;
  topicSlug?: string | null;
  /** When true, hides the bottom nav pill on mobile so study pages can show their own bottom bar */
  hideNavOnMobile?: boolean;
};

export function AuthenticatedNavBar({ hideNavOnMobile }: AuthenticatedNavBarProps) {
  const navItems = [
    { name: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { name: "Upload", url: "/upload", icon: Upload },
    { name: "Settings", url: "/settings", icon: Settings },
  ];

  return (
    <>
      <div className={hideNavOnMobile ? "hidden md:contents" : "contents"}>
        <NavBar items={navItems} className="md:mt-2" />
      </div>
      <div className="fixed top-6 right-6 z-50">
        <UserMenu />
      </div>
    </>
  );
}
