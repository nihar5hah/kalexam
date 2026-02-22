"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export function AuroraBackground({ className }: { className?: string }) {
  const mouseNX = useMotionValue(0);
  const mouseNY = useMotionValue(0);

  const springNX = useSpring(mouseNX, { stiffness: 14, damping: 11, mass: 1.2 });
  const springNY = useSpring(mouseNY, { stiffness: 14, damping: 11, mass: 1.2 });

  const lampPX = useTransform(springNX, (v) => v * 60);
  const lampShift = useTransform(springNY, (v) => `calc(-50% + ${v * 30}px)`);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      mouseNX.set(e.clientX / window.innerWidth - 0.5);
      mouseNY.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, [mouseNX, mouseNY]);

  return (
    // NO overflow-hidden here — the parent page wrapper clips.
    // Blobs are centered on the container's top edge via translateY(-50%)
    // so exactly the bottom half bleeds into the viewport.
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      {/* Primary lamp — wide orange ellipse, center on top edge */}
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: "calc(50% - 550px)",
          x: lampPX,
          y: lampShift,
        }}
      >
        <motion.div
          animate={{
            scaleX: [1, 1.07, 0.96, 1.05, 1],
            scaleY: [1, 1.05, 0.97, 1.04, 1],
            opacity: [0.9, 1, 0.88, 0.98, 0.9],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 1100, height: 700, borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(249,115,22,0.55) 0%, rgba(249,115,22,0.18) 50%, transparent 75%)",
            filter: "blur(60px)",
          }}
        />
      </motion.div>

      {/* Inner amber hot-spot — tighter, brighter core */}
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: "calc(50% - 260px)",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{ scaleX: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          style={{ width: 520, height: 400, borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(251,191,36,0.45) 0%, rgba(245,158,11,0.15) 55%, transparent 80%)",
            filter: "blur(45px)",
          }}
        />
      </motion.div>
    </div>
  );
}

