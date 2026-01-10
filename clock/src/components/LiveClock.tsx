import { useState, useEffect } from "react";

interface LiveClockProps {
  format?: string;
  className?: string;
  ticking?: boolean;
}

function formatTime(date: Date, format: string): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return format
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}

export default function LiveClock({
  format = "HH:mm:ss",
  className,
  ticking = true,
}: LiveClockProps) {
  const [time, setTime] = useState(() => formatTime(new Date(), format));

  useEffect(() => {
    if (!ticking) return;

    const interval = setInterval(() => {
      setTime(formatTime(new Date(), format));
    }, 1000);

    return () => clearInterval(interval);
  }, [format, ticking]);

  return <span className={className}>{time}</span>;
}
