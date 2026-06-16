import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { seedData } from "@/lib/seed";
import type { ContentItem, DashboardData } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "local-dashboard.json");

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(seedData, null, 2));
  }
}

export async function readLocalDashboardData(): Promise<DashboardData> {
  await ensureDataFile();

  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw) as DashboardData;
  } catch {
    return seedData;
  }
}

export async function appendLocalContentItems(items: ContentItem[]) {
  const data = await readLocalDashboardData();
  const existingIds = new Set(data.contentItems.map((item) => item.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));

  const nextData: DashboardData = {
    ...data,
    contentItems: [...newItems, ...data.contentItems],
    activity: [
      {
        id: `activity-weekly-plan-${Date.now()}`,
        label: "Crina created content ideas",
        detail: `${newItems.length} weekly content plan items entered the pipeline as Idea or Brief.`,
        timestamp: "Just now"
      },
      ...data.activity
    ]
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));

  return newItems;
}
