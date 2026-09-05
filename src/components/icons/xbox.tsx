import type { SVGProps } from "react";

/** Official-style Xbox sphere mark (monochrome, inherits currentColor). */
export function XboxIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...props}>
      <path d="M12 1.6c-1.9 0-3.7.55-5.2 1.5-.2.13-.16.3.05.22 1.9-.7 4 .35 5.15 1.2 1.15-.85 3.25-1.9 5.15-1.2.21.08.25-.09.05-.22A9.5 9.5 0 0 0 12 1.6Z" />
      <path d="M5.35 4.16A10.4 10.4 0 0 0 1.6 12c0 2.6.96 4.98 2.54 6.8.3.35.5.16.4-.2-.9-3.2 3.2-9.1 5.5-11.7-1.4-1.5-3.2-2.9-4.35-2.86-.12 0-.24.05-.34.12Z" />
      <path d="M18.65 4.16a.62.62 0 0 0-.34-.12c-1.15-.04-2.95 1.36-4.35 2.86 2.3 2.6 6.4 8.5 5.5 11.7-.1.36.1.55.4.2A10.36 10.36 0 0 0 22.4 12a10.4 10.4 0 0 0-3.75-7.84Z" />
      <path d="M12 8.9c-2.2 2.5-6 8-5.1 10.35A10.36 10.36 0 0 0 12 22.4c1.94 0 3.74-.53 5.1-3.15.9-2.35-2.9-7.85-5.1-10.35Z" />
    </svg>
  );
}
