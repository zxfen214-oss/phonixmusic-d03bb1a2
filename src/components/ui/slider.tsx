import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { hideThumb?: boolean; growOnDrag?: boolean }
>(({ className, hideThumb = false, growOnDrag = false, ...props }, ref) => {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      onPointerDown={() => { if (growOnDrag) setIsDragging(true); }}
      onPointerUp={() => { if (growOnDrag) setIsDragging(false); }}
      onPointerLeave={() => { if (growOnDrag) setIsDragging(false); }}
      {...props}
    >
      <SliderPrimitive.Track
        className="relative w-full grow overflow-hidden rounded-full bg-secondary"
        style={{
          height: isDragging ? '10px' : '8px',
          transition: 'height 200ms ease',
        }}
      >
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          hideThumb && "h-0 w-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        )}
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
