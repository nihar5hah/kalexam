"use client";

import { LayoutDashboard, Upload } from "lucide-react";

import { UserMenu } from "@/components/UserMenu";
import { NavBar } from "@/components/ui/tubelight-navbar";

type AuthenticatedNavBarProps = {
  strategyId?: string | null;
  topicSlug?: string | null;
};

export function AuthenticatedNavBar(props: AuthenticatedNavBarProps) {
  void props;
  const navItems = [
    { name: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { name: "Upload", url: "/upload", icon: Upload },
  ];

  return (
    <>
      <NavBar items={navItems} className="sm:mt-2" />
      <div className="fixed top-6 right-6 z-50">
        <UserMenu />
      </div>
    </>
  );
}
