import Link from "next/link";
import { cn } from "@/lib/utils";

type KalExamLogoProps = {
  /** Visual size preset */
  size?: "sm" | "md" | "lg" | "xl";
  /** Wrap in a home link (default: true) */
  linked?: boolean;
  className?: string;
};

const sizeMap = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-5xl md:text-6xl",
};

function Wordmark({ size = "md", className }: Omit<KalExamLogoProps, "linked">) {
  return (
    <span
      className={cn(
        "font-bold tracking-tight select-none leading-none",
        sizeMap[size],
        className,
      )}
    >
      <span className="text-white">Kal</span>
      <span className="text-orange-400">Exam</span>
    </span>
  );
}

export function KalExamLogo({ size = "md", linked = true, className }: KalExamLogoProps) {
  if (!linked) {
    return <Wordmark size={size} className={className} />;
  }
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center hover:opacity-80 transition-opacity", className)}
      aria-label="KalExam — go home"
    >
      <Wordmark size={size} />
    </Link>
  );
}
