import fs from "fs/promises";
import { exit } from "process";

import { logger } from "./logger.js";
import { collectRewards } from "./collect-rewards.js";
import { updateReadme } from "./update-readme.js";

let userUniqueID = await fs.readFile("src/username.txt", "utf8");
userUniqueID = userUniqueID.trim();

async function main() {
  const rewards = await collectRewards(userUniqueID);

  await updateReadme(rewards);

  logger("success", "🤖 Script complete.");

  exit();
}
main();
