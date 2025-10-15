import puppeteer from "puppeteer";
import fs from "fs/promises";

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

const URL = "https://8ballpool.com/en/shop";
const DELAY = 150;

const collectFreeRewards = async () => {
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
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Evitar detección de automatización
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  await page.setViewport({ width: 1366, height: 768 });

  logMessage("info", `🌐 Navegando a ${URL}`);

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    await page.screenshot({ path: "debug-start.png", fullPage: true });
    await fs.writeFile("debug-start.html", await page.content());
    logMessage("info", "📸 Debug guardado: debug-start.png / debug-start.html");

    await waitForStoreLoad(page);
    const rewards = await findFreeRewards(page);

    await browser.close();
    logMessage("info", "❎ Navegador cerrado correctamente.");

    return rewards;
  } catch (error) {
    logMessage("error", `❌ Error en ejecución: ${error.message}`);

    try {
      await page.screenshot({ path: "debug-error.png", fullPage: true });
      await fs.writeFile("debug-error.html", await page.content());
      logMessage("info", "📸 Debug de error guardado");
    } catch (e) {}

    await browser.close();
    throw error;
  }
};

const waitForStoreLoad = async (page) => {
  logMessage("info", "⏳ Esperando a que cargue la tienda...");

  const storeSelectors = [
    ".product-list-item",
    ".product",
    "[class*='product']",
    ".item",
    ".shop-item",
  ];

  let storeLoaded = false;

  for (const selector of storeSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        logMessage("success", `✅ Tienda cargada con selector: ${selector}`);
        storeLoaded = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!storeLoaded) {
    logMessage("warning", "⚠️ No se encontraron elementos, esperando más tiempo...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  await new Promise((r) => setTimeout(r, 2000));
};

const findFreeRewards = async (page) => {
  const productSelectors = [
    ".product-list-item",
    ".product",
    "[class*='product']",
    ".item",
    ".shop-item",
  ];

  let products = [];

  // Buscar productos
  for (const selector of productSelectors) {
    try {
      products = await page.$$(selector);
      if (products.length > 0) {
        logMessage("info", `🔎 ${products.length} productos encontrados con ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (products.length === 0) {
    logMessage("warning", "⚠️ No se encontraron productos en la página.");
    return [];
  }

  const freeItems = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    try {
      const priceElement = await product.$(
        "button, .price-button, [class*='price'], .buy-button"
      );
      if (!priceElement) continue;

      const priceText = await page.evaluate(
        (el) => el.textContent?.trim()?.toUpperCase() || "",
        priceElement
      );

      if (priceText.includes("FREE")) {
        const nameElement = await product.$("h3, .name, [class*='name'], .title");
        const imageElement = await product.$("img");

        const name = nameElement
          ? await nameElement.evaluate((el) => el.textContent.trim())
          : `Producto ${i + 1}`;
        const img = imageElement
          ? await imageElement.evaluate((el) => el.src)
          : "";

        freeItems.push({ name, img, price: priceText });
        logMessage("success", `🎁 ${name} — ${priceText}`);
      }
    } catch (err) {
      logMessage("warning", `⚠️ Error en producto ${i + 1}: ${err.message}`);
      continue;
    }
  }

  if (freeItems.length === 0) {
    logMessage("info", "🧩 No se encontraron productos FREE esta vez.");
  } else {
    logMessage("info", `🎯 Total FREE encontrados: ${freeItems.length}`);
    // Guardar resultados en JSON
    await fs.writeFile("free-rewards.json", JSON.stringify(freeItems, null, 2));
    logMessage("success", "💾 Archivo guardado: free-rewards.json");
  }

  return freeItems;
};

// EJECUCIÓN PRINCIPAL
(async () => {
  try {
    logMessage("info", "🚀 Iniciando búsqueda de productos FREE...");
    const rewards = await collectFreeRewards();
    logMessage("success", `🤖 Proceso completado: ${rewards.length} productos FREE encontrados.`);
  } catch (error) {
    logMessage("error", `💥 Falló la ejecución: ${error.message}`);
  }
})();
