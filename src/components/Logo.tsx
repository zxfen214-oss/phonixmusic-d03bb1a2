import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  };

  return (
    <div className={cn("flex items-center font-semibold tracking-tight", sizeClasses[size], className)}>
      <span className="text-logo-phonix">Phonix</span>
      <span className="text-logo-music">Music</span>
    </div>
  );
}
