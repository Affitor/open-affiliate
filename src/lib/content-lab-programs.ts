import registryData from "./registry.json";
import { Program } from "./content-lab-types";

interface RegistryCommission {
  type: string;
  rate: string;
  duration: string | null;
}

interface RegistryProgram {
  name: string;
  slug: string;
  url: string;
  commission: RegistryCommission;
  cookie_days: number;
  category: string;
  description: string;
  short_description?: string;
  tags?: string[];
}

function commissionToString(commission: RegistryCommission): string {
  const { type, rate, duration } = commission;
  if (duration) {
    return `${rate} ${type} (${duration})`;
  }
  return `${rate} ${type}`;
}

function mapToProgram(p: RegistryProgram): Program {
  return {
    name: p.name,
    slug: p.slug,
    url: p.url,
    commission: commissionToString(p.commission),
    cookie_days: p.cookie_days,
    category: p.category,
    description: p.description,
  };
}

const programs = (registryData as { programs: RegistryProgram[] }).programs;

export function searchPrograms(query: string): Program[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return programs
    .filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.short_description && p.short_description.toLowerCase().includes(q)) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
      );
    })
    .map(mapToProgram);
}
