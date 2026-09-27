import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnimatedGenerateButtonProps = Omit<ButtonProps, "children" | "aria-label"> & {
  labelIdle?: string;
  labelActive?: string;
  generating?: boolean;
  highlightHueDeg?: number;
  ariaLabel?: string;
};

/** Animated action control. The visible label always describes the actual action. */
export default function AnimatedGenerateButton({
  className,
  labelIdle = "تنفيذ",
  labelActive = "جارٍ التنفيذ…",
  generating = false,
  highlightHueDeg,
  ariaLabel,
  disabled,
  type = "button",
  ...props
}: AnimatedGenerateButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      disabled={disabled || generating}
      aria-label={ariaLabel ?? (generating ? labelActive : labelIdle)}
      aria-busy={generating}
      className={cn("ui-anim-action relative isolate gap-2 overflow-hidden", className)}
      style={{
        ...props.style,
        ...(highlightHueDeg === undefined ? {} : { "--ui-highlight-hue": `${highlightHueDeg}deg` } as React.CSSProperties),
      }}
    >
      <Sparkles aria-hidden="true" className="ui-anim-spark shrink-0" />
      <span className="ui-anim-label relative z-10" aria-hidden="true">
        {Array.from(generating ? labelActive : labelIdle).map((character, index) => (
          <span key={`${generating}-${index}`} className="ui-anim-letter inline-block" style={{ animationDelay: `${index * 65}ms` }}>
            {character === " " ? "\u00a0" : character}
          </span>
        ))}
      </span>
    </Button>
  );
}