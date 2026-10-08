import {
  Car,
  Goal as GoalIcon,
  GraduationCap,
  Heart,
  House,
  Plane,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import type { GoalTheme } from "@/lib/goals";

export interface Goal {
  _id: string;
  name: string;
  theme: GoalTheme;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface GoalsPayload {
  goals: Goal[];
  monthlySurplus: number;
  surplusMonths: number;
}

export const THEME_META: Record<GoalTheme, { label: string; icon: LucideIcon; color: string }> = {
  general: { label: "General", icon: GoalIcon, color: "var(--chart-1)" },
  emergency: { label: "Emergency fund", icon: ShieldCheck, color: "var(--chart-3)" },
  travel: { label: "Travel", icon: Plane, color: "var(--chart-5)" },
  home: { label: "Home", icon: House, color: "var(--chart-4)" },
  vehicle: { label: "Vehicle", icon: Car, color: "var(--chart-2)" },
  education: { label: "Education", icon: GraduationCap, color: "var(--chart-5)" },
  gadget: { label: "Gadget", icon: Smartphone, color: "var(--chart-2)" },
  wedding: { label: "Wedding", icon: Heart, color: "var(--chart-1)" },
};
