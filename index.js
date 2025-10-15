import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { exit } from "process";

const logMessage = (type, message) => {
  const colors = {
    success: "\x1b[32m",
    error: "\x1b[31m",
    info: "\x1b[36m",
    warning: "\x1b[33m",
    reset: "\x1b[0m",
  };
  const color = colors[type] || colors.info;
  console.log(`${color}%s${colors.reset}`, message, "\n");
};

const makeRewardData = (imageSrc, name, quantity) => {
  return `<img src="${imageSrc}" height="25" alt="${name}"/> ${name} X ${quantity}`;
};

const getArchivedFileName = (date) => {
  if (!(date instanceof Date)) {
    throw new Error("Invalid input, expected a Date object.");
  }
  let year = date.getFullYear();
  let month = date.getMonth();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${String(month).padStart(2, "0")}-${year}`;
};

const URL = "https://8ballpool.com/en/shop";
const USER_UNIQUE_ID = "4572143551";
const DELAY = 150;

const collectRewards = async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    slowMo: DELAY,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ],
  });

  const page = await browser.newPage();
  
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  await page.setViewport({ width: 1366, height: 768 });

  logMessage("info", `🌐 Navigating to ${URL}`);
  
  try {
    await page.goto(URL, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    // ✅ CORREGIDO: Usar page.waitForTimeout
    await page.waitForTimeout(3000);

    // Debug files
    await page.screenshot({ path: 'debug-start.png', fullPage: true });
    await fs.writeFile('debug-start.html', await page.content());
    logMessage("info", "📸 Debug files saved: debug-start.png y debug-start.html");

    const loginStatus = await checkLoginStatus(page);
    
    if (!loginStatus.isLoggedIn) {
      logMessage("warning", "⚠️ User not logged in, attempting login...");
      await attemptLogin(page);
    } else {
      logMessage("success", "✅ User already logged in or login not required");
    }

    await waitForStoreLoad(page);
    const rewards = await claimFreeRewards(page);
    
    await browser.close();
    logMessage("info", "❎ Browser closed.");
    
    return rewards;
    
  } catch (error) {
    logMessage("error", `❌ Error during execution: ${error.message}`);
    
    try {
      await page.screenshot({ path: 'debug-error.png', fullPage: true });
      await fs.writeFile('debug-error.html', await page.content());
      logMessage("info", "📸 Error debug files saved");
    } catch (e) {
      // Ignore
    }
    
    await browser.close();
    throw error;
  }
};

const checkLoginStatus = async (page) => {
  const loginSelectors = [
    'button[data-testid="btn-login-modal"]',
    'button[class*="login"]',
    '.login-button',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    '[data-action="login"]',
    'a[href*="/login"]'
  ];

  const loggedInSelectors = [
    '.user-profile',
    '[data-testid="user-menu"]',
    '.username',
    '[data-user-id]',
    '.profile-picture',
    'button[class*="logout"]'
  ];

  for (const selector of loggedInSelectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 2000 });
      if (element) {
        logMessage("info", `✅ Logged in indicator found: ${selector}`);
        return { isLoggedIn: true, method: 'loggedInSelector' };
      }
    } catch (e) {
      continue;
    }
  }

  for (const selector of loginSelectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 2000, visible: true });
      if (element) {
        logMessage("info", `🔐 Login button found: ${selector}`);
        return { isLoggedIn: false, loginSelector: selector };
      }
    } catch (e) {
      continue;
    }
  }

  logMessage("warning", "🤔 Could not determine login status, assuming logged in");
  return { isLoggedIn: true, method: 'unknown' };
};

const attemptLogin = async (page) => {
  const loginSelectors = [
    'button[data-testid="btn-login-modal"]',
    'button[class*="login"]',
    '.login-button',
    'button:contains("Login")'
  ];

  let loginButton = null;
  let usedSelector = null;

  for (const selector of loginSelectors) {
    try {
      loginButton = await page.waitForSelector(selector, { 
        visible: true, 
        timeout: 5000 
      });
      if (loginButton) {
        usedSelector = selector;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!loginButton) {
    logMessage("warning", "⚠️ No login button found, skipping login");
    return;
  }

  try {
    await loginButton.click();
    logMessage("info", `🔐 Clicked login button with selector: ${usedSelector}`);

    // ✅ CORREGIDO: Usar page.waitForTimeout
    await page.waitForTimeout(2000);

    const idSelectors = [
      'input[data-testid="input-unique-id"]',
      'input[type="text"]',
      'input[placeholder*="ID"]',
      'input[name="uniqueId"]'
    ];

    let idInput = null;
    for (const selector of idSelectors) {
      try {
        idInput = await page.waitForSelector(selector, { visible: true, timeout: 3000 });
        if (idInput) break;
      } catch (e) {
        continue;
      }
    }

    if (!idInput) {
      logMessage("warning", "⚠️ Unique ID input not found");
      return;
    }

    await idInput.type(USER_UNIQUE_ID, { delay: DELAY });
    logMessage("info", "📝 Unique ID entered");

    const confirmSelectors = [
      'button[data-testid="btn-user-go"]',
      'button[type="submit"]',
      'button:contains("Go")',
      '.confirm-button'
    ];

    let confirmButton = null;
    for (const selector of confirmSelectors) {
      try {
        confirmButton = await page.waitForSelector(selector, { visible: true, timeout: 3000 });
        if (confirmButton) break;
      } catch (e) {
        continue;
      }
    }

    if (confirmButton) {
      await confirmButton.click();
      // ✅ CORREGIDO: Usar page.waitForTimeout
      await page.waitForTimeout(3000);
      logMessage("success", "✅ Login attempt completed");
    }

  } catch (error) {
    logMessage("warning", `⚠️ Login failed but continuing: ${error.message}`);
  }
};

const waitForStoreLoad = async (page) => {
  logMessage("info", "⏳ Waiting for store to load...");
  
  const storeSelectors = [
    ".product-list-item",
    ".product",
    "[class*='product']",
    ".item",
    ".shop-item"
  ];

  let storeLoaded = false;
  for (const selector of storeSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        logMessage("success", `✅ Store loaded with selector: ${selector}`);
        storeLoaded = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!storeLoaded) {
    // ✅ CORREGIDO: Intentar cargar más tiempo
    logMessage("warning", "⚠️ Store selectors not found, waiting longer...");
    await page.waitForTimeout(5000);
    
    // Verificar si hay algún contenido
    const bodyContent = await page.evaluate(() => document.body.innerText);
    if (!bodyContent || bodyContent.includes("blocked") || bodyContent.includes("captcha")) {
      throw new Error("Store not loaded - possible bot detection or page blocked");
    }
  }

  // ✅ CORREGIDO: Usar page.waitForTimeout
  await page.waitForTimeout(2000);
};

const claimFreeRewards = async (page) => {
  let rewards = [];
  const productSelectors = [
    ".product-list-item",
    ".product",
    "[class*='product']",
    ".item",
    ".shop-item"
  ];

  let products = [];
  for (const selector of productSelectors) {
    try {
      products = await page.$$(selector);
      if (products.length > 0) {
        logMessage("info", `💡 ${products.length} products found with selector: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (products.length === 0) {
    logMessage("warning", "⚠️ No products found - page structure may have changed");
    
    // Debug: mostrar contenido de la página
    const pageContent = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 500)
    }));
    logMessage("info", `Page info: ${JSON.stringify(pageContent)}`);
    
    return rewards;
  }

  for (let i = 0; i < products.length; i++) {
    try {
      const product = products[i];
      
      const priceButton = await product.$("button, .price-button, [class*='price'], .buy-button");
      if (!priceButton) continue;

      const priceText = await page.evaluate(el => {
        return el.textContent?.trim().toUpperCase() || 
               el.getAttribute('data-price')?.toUpperCase() ||
               '';
      }, priceButton);
      
      logMessage("info", `Product ${i + 1}: Price text = "${priceText}"`);
      
      if (priceText?.includes("FREE") || priceText === "0" || priceText === "") {
        await priceButton.click();
        // ✅ CORREGIDO: Usar page.waitForTimeout
        await page.waitForTimeout(1000);

        const imageElement = await product.$("img");
        const nameElement = await product.$("h3, .name, [class*='name'], .title");
        const quantityElement = await product.$(".amount-text, .quantity, [class*='amount']");

        let imageSrc = "", name = `Reward ${i + 1}`, quantity = "1";

        if (imageElement) {
          imageSrc = await imageElement.evaluate(i => i.src || i.getAttribute("data-src") || '');
        }
        if (nameElement) {
          name = await nameElement.evaluate(el => el.textContent?.trim() || `Reward ${i + 1}`);
        }
        if (quantityElement) {
          quantity = await quantityElement.evaluate(el => el.textContent?.trim() || "1");
        }

        rewards.push(makeRewardData(imageSrc, name, quantity));
        logMessage("success", `🎉 Claimed: ${name} X ${quantity}`);
      }
    } catch (error) {
      logMessage("warning", `⚠️ Error processing product ${i + 1}: ${error.message}`);
      continue;
    }
  }

  return rewards;
};

const updateReadme = async (rewards) => {
  const today = new Date();
  const todaysRewards = rewards.length > 0 ? rewards.join("; ") : "No rewards found or page changed";
  const tableRow = `| ${today.toLocaleDateString()} | ${todaysRewards} |\n`;
  
  try {
    let prevReadmeContent = "# 8 Ball Pool Free Rewards Tracker\n\n";
    prevReadmeContent += "| Date | Rewards |\n|------|---------|\n";

    if (today.getDate() === 1) {
      const archivedFileName = getArchivedFileName(today);
      await fs.mkdir("archive", { recursive: true });
      
      try {
        const currentReadme = await fs.readFile("README.md", "utf8");
        const archivePath = path.join("archive", `${archivedFileName}.md`);
        await fs.writeFile(archivePath, currentReadme);
        logMessage("info", `🗄️ Archived to ${archivedFileName}.md`);
      } catch (e) {
        logMessage("warning", "⚠️ Could not archive previous README");
      }
    } else {
      try {
        prevReadmeContent = await fs.readFile("README.md", "utf8");
      } catch (e) {
        // File doesn't exist, start fresh
      }
    }

    // Append new row
    await fs.writeFile("README.md", prevReadmeContent + tableRow);
    logMessage("success", `📝 Updated README with ${rewards.length} rewards`);
  } catch (error) {
    logMessage("error", `❌ Failed to update README: ${error.message}`);
  }
};

// EJECUCIÓN PRINCIPAL
(async () => {
  try {
    logMessage("info", "🚀 Starting 8 Ball Pool Free Rewards Collector...");
    const rewards = await collectRewards();
    await updateReadme(rewards);
    logMessage("success", `🤖 Completed! Found ${rewards.length} rewards.`);
    process.exit(0);
  } catch (error) {
    logMessage("error", `💥 Failed: ${error.message}`);
    logMessage("info", "💡 Check debug-start.html and debug-start.png for page structure");
    process.exit(1);
  }
})();