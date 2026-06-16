import type { Activity } from "@/lib/types";

export function makeActivity(label: string, detail: string): Omit<Activity, "id"> {
  return {
    label,
    detail,
    timestamp: "Just now"
  };
}
