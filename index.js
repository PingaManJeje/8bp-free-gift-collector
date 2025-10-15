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
  let month = date.getMonth(); // 0 - Jan; 11 - Dec
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${String(month).padStart(2, "0")}-${year}`;
};

const URL = "https://8ballpool.com/en/shop";
const USER_UNIQUE_ID = "4572143551";
const DELAY = 150; // Aumentado para mayor realismo

const collectRewards = async () => {
  const browser = await puppeteer.launch({
    headless: "new", // Usar nuevo headless mode
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
      "--single-process", // Para GitHub Actions
      "--disable-gpu"
    ],
  });

  const page = await browser.newPage();
  
  // Anti-detección mejorada
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Eliminar webdriver y otras huellas
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Simular plugins y languages
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  // Establecer viewport realista
  await page.setViewport({ width: 1366, height: 768 });

  logMessage("info", `🌐 Navigating to ${URL}`);
  
  try {
    await page.goto(URL, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    // DEBUG: Guardar screenshot y HTML para debugging
    await page.screenshot({ path: 'debug-start.png', fullPage: true });
    await fs.writeFile('debug-start.html', await page.content());
    logMessage("info", "📸 Debug files saved: debug-start.png y debug-start.html");

    // Esperar carga adicional
    await page.waitForTimeout(3000);

    // VERIFICAR ESTADO DE LOGIN CON MÚLTIPLES MÉTODOS
    const loginStatus = await checkLoginStatus(page);
    
    if (!loginStatus.isLoggedIn) {
      logMessage("warning", "⚠️ User not logged in, attempting login...");
      await attemptLogin(page);
    } else {
      logMessage("success", "✅ User already logged in or login not required");
    }

    // Esperar que la tienda cargue completamente
    await waitForStoreLoad(page);

    // Buscar y reclamar recompensas
    const rewards = await claimFreeRewards(page);
    
    await browser.close();
    logMessage("info", "❎ Browser closed.");
    
    if (rewards.length === 0) {
      logMessage("warning", "⚠️ No rewards found or claimed");
      return []; // No lanzar error, solo advertir
    }
    
    return rewards;
    
  } catch (error) {
    logMessage("error", `❌ Error during execution: ${error.message}`);
    
    // Guardar debug info en caso de error
    try {
      await page.screenshot({ path: 'debug-error.png', fullPage: true });
      await fs.writeFile('debug-error.html', await page.content());
      logMessage("info", "📸 Error debug files saved");
    } catch (e) {
      logMessage("error", "Failed to save debug files");
    }
    
    await browser.close();
    throw error;
  }
};

// Verificar estado de login con múltiples selectores
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

  // Verificar si ya está logueado
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

  // Verificar si hay botón de login visible
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

  // Si no encontramos ni login ni logged-in, asumir que está logueado o la página cambió
  logMessage("warning", "🤔 Could not determine login status, assuming logged in");
  return { isLoggedIn: true, method: 'unknown' };
};

// Intentar login con manejo robusto de errores
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
    throw new Error("Login button not found with any selector");
  }

  try {
    await loginButton.click();
    logMessage("info", `🔐 Clicked login button with selector: ${usedSelector}`);

    // Esperar modal de login y campo de ID
    await page.waitForTimeout(2000);

    // Buscar campo de unique ID
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
      throw new Error("Unique ID input field not found");
    }

    await idInput.type(USER_UNIQUE_ID, { delay: DELAY });
    logMessage("info", "📝 Unique ID entered");

    // Buscar botón de confirmar
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
      await page.waitForTimeout(3000);
      logMessage("success", "✅ Login attempt completed");
    } else {
      logMessage("warning", "⚠️ Confirm button not found, but ID was entered");
    }

  } catch (error) {
    logMessage("warning", `⚠️ Login failed but continuing: ${error.message}`);
    // No lanzar error fatal, continuar asumiendo que podría estar logueado
  }
};

// Esperar que la tienda cargue
const waitForStoreLoad = async (page) => {
  logMessage("info", "⏳ Waiting for store to load...");
  
  // Múltiples intentos de esperar elementos de la tienda
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
    throw new Error("Store elements not found, page might have changed structure");
  }

  await page.waitForTimeout(2000); // Tiempo adicional para animaciones
};

// Reclamar recompensas gratuitas
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
    logMessage("warning", "⚠️ No products found");
    return rewards;
  }

  for (let i = 0; i < products.length; i++) {
    try {
      const product = products[i];
      logMessage("info", `🔍 Processing product ${i + 1}/${products.length}`);

      // Buscar botón de precio
      const priceButton = await product.$("button, .price-button, [class*='price']");
      if (!priceButton) continue;

      const priceText = await page.evaluate(el => el.textContent?.trim().toUpperCase(), priceButton);
      
      if (priceText?.includes("FREE") || priceText === "0") {
        await priceButton.click();
        await page.waitForTimeout(1000); // Esperar confirmación

        // Intentar extraer datos del producto
        const imageElement = await product.$("img");
        const nameElement = await product.$("h3, .name, [class*='name']");
        const quantityElement = await product.$(".amount-text, .quantity, [class*='amount']");

        let imageSrc = "", name = "Unknown Reward", quantity = "1";

        if (imageElement) {
          imageSrc = await imageElement.evaluate(i => i.getAttribute("src") || i.getAttribute("data-src"));
        }
        if (nameElement) {
          name = await nameElement.evaluate(el => el.textContent?.trim() || "Unknown");
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
  const todaysRewards = `| ${today.toLocaleDateString()} | ${rewards.length > 0 ? rewards.join("; ") : "No rewards found"} |\n`;
  
  try {
    let prevReadmeContent;
    if (today.getDate() === 1) {
      const archivedFileName = getArchivedFileName(today);
      const archiveFilePath = path.join("archive", `${archivedFileName}.md`);
      await fs.mkdir("archive", { recursive: true });
      
      try {
        const currentReadme = await fs.readFile("README.md", "utf8");
        await fs.writeFile(archiveFilePath, currentReadme);
        logMessage("info", `🗄️ Archived ${archivedFileName}`);
      } catch (e) {
        logMessage("warning", "⚠️ Could not archive previous README");
      }
      
      try {
        prevReadmeContent = await fs.readFile("README.example.md", "utf8");
      } catch (e) {
        prevReadmeContent = "# 8 Ball Pool Free Rewards\n\n| Date | Rewards |\n|------|---------|\n";
      }
    } else {
      try {
        prevReadmeContent = await fs.readFile("README.md", "utf8");
      } catch (e) {
        prevReadmeContent = "# 8 Ball Pool Free Rewards\n\n| Date | Rewards |\n|------|---------|\n";
      }
    }

    // Asegurar formato de tabla
    const tableMatch = prevReadmeContent.match(/\| Date \| Rewards \|\n\|------\|---------\\|\n(.*)/s);
    if (tableMatch) {
      prevReadmeContent = prevReadmeContent.replace(
        /\| Date \| Rewards \|\n\|------\|---------\\|\n(.*)/s,
        `| Date | Rewards |\n|------|---------|\n${todaysRewards}$1`
      );
    } else {
      prevReadmeContent += todaysRewards;
    }

    await fs.writeFile("README.md", prevReadmeContent);
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
    logMessage("success", `🤖 Script completed successfully! Claimed ${rewards.length} rewards.`);
  } catch (error) {
    logMessage("error", `💥 Script failed: ${error.message}`);
    logMessage("info", "💡 Check debug files (debug-*.png/html) for troubleshooting");
    process.exit(1);
  }
  exit(0);
})();
