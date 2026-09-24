import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — same merge semantics as the ui kit's internal helper (later
 * classes win over conflicting base classes). Local copy: the kit is
 * deliberately untouched by this branch.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
