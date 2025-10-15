import fs from "fs/promises";
import path from "path";

import { logger } from "./logger.js";
import { getArchivedFileName } from "./utils.js";

/**
 *
 * @param {string[]} rewards
 *
 */
export const updateReadme = async (rewards) => {
  const today = new Date();
  const todaysRewards = `| ${today.toLocaleDateString()} | ${rewards.join(
    "; "
  )} |\n`;
  let prevReadmeContent;
  if (today.getDate() === 1) {
    const archivedFileName = getArchivedFileName(today);
    const archiveFilePath = path.join("archive", `${archivedFileName}.md`);
    await fs.mkdir("archive", { recursive: true });
    const currentReadme = await fs.readFile("README.md", "utf8");
    await fs.writeFile(archiveFilePath, currentReadme);
    logger("info", `🗄️ Archived ${archivedFileName}`);
    prevReadmeContent = await fs.readFile("README.example.md", "utf8");
  } else {
    prevReadmeContent = await fs.readFile("README.md", "utf8");
  }
  prevReadmeContent += todaysRewards;
  await fs.writeFile("README.md", prevReadmeContent);
  logger("success", `📝 Updated README`);
};
