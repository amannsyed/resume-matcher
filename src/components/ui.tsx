import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility function to merge tailwind classes */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost"; size?: "default" | "sm" | "lg" }
>(({ className, variant = "default", size = "default", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-sm text-[11px] font-bold uppercase tracking-widest ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-10 px-6 py-2",
        size === "sm" && "h-8 px-4 py-1",
        size === "lg" && "h-12 px-8 py-3",
        variant === "default" && "bg-[#D4AF37] text-black hover:bg-[#b0902c]",
        variant === "outline" && "border border-white/20 bg-transparent hover:bg-white/5 text-white/60",
        variant === "ghost" && "hover:bg-white/5 text-white/60 hover:text-white",
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50 custom-scrollbar",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-white/5 bg-[#0D0D0D] text-[#E5E5E5] shadow-xl flex flex-col", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6 border-b border-white/5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] leading-tight", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 flex-1", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[11px] uppercase tracking-wider text-white/50 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />;
}
