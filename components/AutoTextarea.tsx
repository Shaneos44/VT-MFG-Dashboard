"use client";

import * as React from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  onChange: (v: string) => void;
};

export default function AutoTextarea({ value, onChange, className = "", ...rest }: Props) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={
        "w-full min-h-[36px] resize-y whitespace-normal break-words text-wrap leading-5 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        className
      }
      {...rest}
    />
  );
}
