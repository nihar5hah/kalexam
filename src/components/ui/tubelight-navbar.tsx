"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient"

interface NavItem {
  name: string
  url: string
  icon: LucideIcon
}

interface NavBarProps {
  items: NavItem[]
  className?: string
}

export function NavBar({ items, className }: NavBarProps) {
  const pathname = usePathname()
  const [selectedTab, setSelectedTab] = useState(items[0]?.name ?? "")
  const [isMobile, setIsMobile] = useState(false)

  const directMatch = items.find((item) => {
    if (item.url.startsWith("#")) {
      return false
    }

    const targetPath = item.url.split("?")[0] ?? item.url
    return pathname === targetPath || pathname.startsWith(targetPath + "/")
  })

  const activeTab = directMatch?.name ?? selectedTab

  const handleNavClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    item: NavItem,
  ) => {
    setSelectedTab(item.name)

    if (!item.url.startsWith("#")) {
      return
    }

    event.preventDefault()
    const targetId = item.url.slice(1)
    const targetElement = document.getElementById(targetId)

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.replaceState(null, "", item.url)
    }
  }

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <div
      className={cn(
        "fixed bottom-6 sm:bottom-auto sm:top-0 left-1/2 -translate-x-1/2 z-50 sm:pt-6 pointer-events-none",
        className,
      )}
    >
      <HoverBorderGradient
        as="div"
        containerClassName="rounded-full pointer-events-auto"
        className="bg-transparent px-0 py-0"
      >
        <div className="flex items-center gap-3 bg-background/5 border border-border backdrop-blur-lg py-1 px-1 rounded-full shadow-lg">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.name

            return (
              <Link
                key={item.name}
                href={item.url}
                onClick={(event) => handleNavClick(event, item)}
                className={cn(
                  "relative cursor-pointer text-sm font-semibold px-6 py-2 rounded-full transition-colors duration-200",
                "text-foreground/80 hover:text-white transition-colors",
                isActive && "text-white",
                )}
              >
                {isMobile ? <Icon size={18} strokeWidth={2.5} /> : <span>{item.name}</span>}

                {isActive && (
                  <motion.div
                    layoutId="lamp"
                    className="absolute inset-0 w-full bg-orange-500/10 rounded-full -z-10 border border-orange-400/20"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 320,
                      damping: 30,
                    }}
                  >
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-7 h-[2px] bg-orange-400 rounded-full">
                      <div className="absolute w-10 h-4 bg-orange-400/20 rounded-full blur-md -top-1 -left-1.5" />
                    </div>
                  </motion.div>
                )}
              </Link>
            )
          })}
        </div>
      </HoverBorderGradient>
    </div>
  )
}
