import { rm } from "fs/promises";
import path from "path";

await rm(path.join(process.cwd(), ".next"), { recursive: true, force: true });
console.log("Removed .next cache.");
