import type { Browser, Page } from "puppeteer-core";
import { startUiServer, PRESETS } from "../src/ui/server";
import { SolInquisitorPlugin } from "../src/plugin";
import { Connection } from "@solana/web3.js";
import * as http from "http";
import * as net from "net";

let puppeteer: any;
async function getPuppeteer() {
  if (!puppeteer) {
    try {
      const Module = require("module");
      const parent = new Module(process.cwd());
      parent.paths = Module._nodeModulePaths(process.cwd());
      const mod = Module._load("puppeteer-core", parent, false);
      puppeteer = mod.default || mod;
    } catch {
      const fn = new Function('return import("puppeteer-core")');
      const mod = await fn();
      puppeteer = mod.default || mod;
    }
  }
  return puppeteer;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

describe("Browser E2E Automated Verification: Sol-Inquisitor Institutional HUD", () => {
  let server: http.Server;
  let serverPort: number;
  let browser: Browser;
  let page: Page;
  const CHROME_PATH =
    process.env.CHROME_BIN ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  beforeAll(async () => {
    serverPort = await getFreePort();

    // Deterministic mock plugin engine to prevent any unhandled live network requests
    const mockConnection = {
      getTokenLargestAccounts: jest.fn().mockResolvedValue({ value: [] }),
      simulateTransaction: jest.fn(),
      getParsedAccountInfo: jest.fn(),
      getAccountInfo: jest.fn().mockResolvedValue(null),
    } as unknown as Connection;

    const mockEngine = new SolInquisitorPlugin({
      connection: mockConnection,
      rugScoreThreshold: 40,
      mevScoreThreshold: 50,
      strictSimulationRequired: false,
    });

    server = startUiServer(serverPort, mockEngine);

    const p = await getPuppeteer();
    browser = await p.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Grant clipboard permissions to avoid headless permission denial
    const context = browser.defaultBrowserContext();
    try {
      await context.overridePermissions(`http://localhost:${serverPort}`, [
        "clipboard-read",
        "clipboard-write",
      ]);
    } catch {
      // Graceful fallback if unsupported
    }

    // Intercept /api/audit to deliver instant, deterministic telemetry (<5ms, zero 429 rate limits)
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("/api/audit") && req.method() === "POST") {
        const data = JSON.parse(req.postData() || "{}");
        const mint = data.targetMint || data.mint;

        // Malformed input simulation
        if (mint === "MalformedNotBase58!!!") {
          req.respond({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "BLOCKED",
              decision: "BLOCKED",
              totalRiskScore: 100,
              overallRiskScore: 100,
              vetoReasons: ["Fail-Secure Exception: Invalid Base58 character"],
              error: "Invalid Base58",
            }),
          });
          return;
        }

        // Custom token simulation
        if (mint === "CustomToken11111111111111111111111111111111") {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "APPROVED",
              decision: "APPROVED",
              totalRiskScore: 10,
              overallRiskScore: 10,
              timestamp: new Date().toISOString(),
              targetMint: mint,
              expectedOutput: data.expectedOutput,
              summary: "Custom proposal verified safe",
              vetoReasons: [],
              recommendations: ["Cleared for execution"],
              rugProbe: {
                isSafe: true,
                totalRiskScore: 10,
                hasFreezeAuthority: false,
                hasMintAuthority: false,
                topHoldersSharePercentage: 20.0,
              },
              mevReport: {
                actualSlippageBps: data.maxSlippageBps,
                slippageBps: data.maxSlippageBps,
                slippageTier: "LOW",
                sandwichVulnerable: false,
                recommendedMaxSlippageBps: 100,
              },
              simulation: {
                passed: true,
                simulatedBalanceDelta: data.expectedOutput,
                unitsConsumed: 25000,
                logs: ["Program success"],
              },
            }),
          });
          return;
        }

        // Circle USDC preset
        if (mint === PRESETS.usdc.mint) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "BLOCKED",
              decision: "BLOCKED",
              totalRiskScore: 45,
              overallRiskScore: 45,
              timestamp: new Date().toISOString(),
              targetMint: mint,
              summary: "Circle freeze authority active",
              vetoReasons: ["Active freeze authority detected (7dGbd93Ep1C5592NhnR2)"],
              recommendations: ["Veto transaction proposal"],
              rugProbe: {
                isSafe: false,
                totalRiskScore: 45,
                freezeRiskScore: 45,
                hasFreezeAuthority: true,
                freezeAuthority: "7dGbd93Ep1C5592NhnR2",
                hasMintAuthority: false,
                topHoldersSharePercentage: 15.0,
              },
              mevReport: {
                actualSlippageBps: 100,
                slippageBps: 100,
                slippageTier: "LOW",
                sandwichVulnerable: false,
                recommendedMaxSlippageBps: 100,
              },
              simulation: {
                passed: true,
                simulatedBalanceDelta: 1000000,
                unitsConsumed: 25000,
                logs: ["Program success"],
              },
            }),
          });
          return;
        }

        // Honeypot preset
        if (mint === PRESETS.honeypot.mint) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "BLOCKED",
              decision: "BLOCKED",
              totalRiskScore: 95,
              overallRiskScore: 95,
              timestamp: new Date().toISOString(),
              targetMint: mint,
              summary: "Synthetic honeypot detected",
              vetoReasons: [
                "Unrevoked Mint Authority detected",
                "Whale concentration exceeds 85%",
              ],
              recommendations: ["Blacklist mint address"],
              rugProbe: {
                isSafe: false,
                totalRiskScore: 95,
                hasFreezeAuthority: false,
                hasMintAuthority: true,
                mintAuthority: "HoneyMintDeployerAddress111111111111111111",
                mintRiskScore: 35,
                topHoldersSharePercentage: 88.5,
                concentrationRiskScore: 30,
              },
              mevReport: {
                actualSlippageBps: 150,
                slippageBps: 150,
                slippageTier: "MEDIUM",
                sandwichVulnerable: false,
                recommendedMaxSlippageBps: 100,
              },
              simulation: {
                passed: true,
                simulatedBalanceDelta: 100000000,
                unitsConsumed: 28000,
                logs: ["Success"],
              },
            }),
          });
          return;
        }

        // MEV Sandwich preset
        if (data.maxSlippageBps === 700) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "BLOCKED",
              decision: "BLOCKED",
              totalRiskScore: 65,
              overallRiskScore: 65,
              timestamp: new Date().toISOString(),
              targetMint: mint,
              summary: "MEV sandwich risk critical",
              vetoReasons: ["700 bps slippage exposes swap to Jito sandwich attack"],
              recommendations: ["Tune slippage to <= 100 bps"],
              rugProbe: {
                isSafe: true,
                totalRiskScore: 0,
                hasFreezeAuthority: false,
                hasMintAuthority: false,
                topHoldersSharePercentage: 12.4,
              },
              mevReport: {
                actualSlippageBps: 700,
                slippageBps: 700,
                slippageTier: "CRITICAL",
                sandwichVulnerable: true,
                recommendedMaxSlippageBps: 100,
                estimatedExtractableValueUsd: "35.00",
              },
              simulation: {
                passed: true,
                simulatedBalanceDelta: 5000000,
                unitsConsumed: 28450,
                logs: ["Success"],
              },
            }),
          });
          return;
        }

        // BONK / Clean SPL default preset
        if (mint === PRESETS.bonk.mint || data.maxSlippageBps <= 100) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verdict: "APPROVED",
              decision: "APPROVED",
              totalRiskScore: 0,
              overallRiskScore: 0,
              timestamp: new Date().toISOString(),
              targetMint: mint,
              summary: "Safe to sign. Zero cryptographic vulnerabilities detected.",
              vetoReasons: [],
              recommendations: [],
              rugProbe: {
                isSafe: true,
                totalRiskScore: 0,
                hasFreezeAuthority: false,
                hasMintAuthority: false,
                topHoldersSharePercentage: 12.4,
              },
              mevReport: {
                actualSlippageBps: data.maxSlippageBps,
                slippageBps: data.maxSlippageBps,
                slippageTier: "LOW",
                sandwichVulnerable: false,
                recommendedMaxSlippageBps: 100,
              },
              simulation: {
                passed: true,
                simulatedBalanceDelta: data.expectedOutput,
                unitsConsumed: 28450,
                logs: ["Program 11111111 success"],
              },
            }),
          });
          return;
        }
      }
      req.continue();
    });
  }, 30000);

  afterAll(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      if ((server as any).closeAllConnections) {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("B1: Initial page load renders institutional HUD and passes telemetry checks", async () => {
    await page.goto(`http://localhost:${serverPort}`, { waitUntil: "networkidle0" });

    const title = await page.title();
    expect(title).toContain("Sol-Inquisitor");

    const brandText = await page.$eval("h1", (el) => el.textContent?.trim());
    expect(brandText).toContain("SOL-INQUISITOR");

    // Wait for the automatic initial audit to finish rendering
    await page.waitForFunction(
      () => document.getElementById("verdictText")?.textContent?.trim() === "APPROVED",
      { timeout: 5000 }
    );

    const verdictText = await page.$eval("#verdictText", (el) => el.textContent?.trim());
    expect(verdictText).toBe("APPROVED");
  }, 10000);

  test("B2: Preset Scenario 1 - Clean SPL Mint (BONK) greenlights approval", async () => {
    await page.click("#btnPresetBonk");

    await page.waitForFunction(
      () => document.getElementById("verdictText")?.textContent?.trim() === "APPROVED",
      { timeout: 5000 }
    );

    const verdictPill = await page.$eval("#verdictPill", (el) => el.textContent?.trim());
    expect(verdictPill).toBe("PROPOSAL CLEARED");

    const threatScore = await page.$eval("#scoreValue", (el) =>
      parseInt(el.textContent || "999", 10)
    );
    expect(threatScore).toBeLessThanOrEqual(20);

    const rugSummary = await page.$eval("#rugSummary", (el) => el.textContent?.trim());
    expect(rugSummary).toContain("Clean");
  }, 10000);

  test("B3: Preset Scenario 2 - Circle USDC triggers Freeze Authority Veto", async () => {
    await page.click("#btnPresetUsdc");

    // Wait for freeze status to display Active authority
    await page.waitForFunction(
      () => document.getElementById("tabFreezeStatus")?.textContent?.includes("Active"),
      { timeout: 5000 }
    );

    const verdictText = await page.$eval("#verdictText", (el) => el.textContent?.trim());
    expect(verdictText).toContain("BLOCKED");

    const verdictPill = await page.$eval("#verdictPill", (el) => el.textContent?.trim());
    expect(verdictPill).toBe("ADVERSARIAL VETO");

    const freezeStatus = await page.$eval("#tabFreezeStatus", (el) => el.textContent?.trim());
    expect(freezeStatus).toContain("Active");
  }, 10000);

  test("B4: Preset Scenario 3 - Synthetic Honeypot triggers Critical Rug Veto", async () => {
    await page.click("#btnPresetHoneypot");

    // Wait for mint status to show active mint authority and score >= 90
    await page.waitForFunction(
      () => {
        const mintStatus = document.getElementById("tabMintStatus")?.textContent || "";
        const score = parseInt(document.getElementById("scoreValue")?.textContent || "0", 10);
        return mintStatus.includes("Active") && score >= 90;
      },
      { timeout: 5000 }
    );

    const threatScore = await page.$eval("#scoreValue", (el) =>
      parseInt(el.textContent || "0", 10)
    );
    expect(threatScore).toBeGreaterThanOrEqual(90);

    const mintStatus = await page.$eval("#tabMintStatus", (el) => el.textContent?.trim());
    expect(mintStatus).toContain("Active");

    const rugSummary = await page.$eval("#rugSummary", (el) => el.textContent?.trim());
    expect(rugSummary).toContain("Honeypot Flagged");
  }, 10000);

  test("B5: Preset Scenario 4 - Predatory MEV Sandwich triggers Slippage Veto", async () => {
    await page.click("#btnPresetMev");

    // Wait for MEV summary to show sandwich vulnerable
    await page.waitForFunction(
      () => document.getElementById("mevSummary")?.textContent?.includes("Sandwich Vulnerable"),
      { timeout: 5000 }
    );

    const slippageValue = await page.$eval("#inputSlippage", (el: any) => el.value);
    expect(slippageValue).toBe("700");

    const mevSummary = await page.$eval("#mevSummary", (el) => el.textContent?.trim());
    expect(mevSummary).toContain("Sandwich Vulnerable");
  }, 10000);

  test("B6: Interactive Forensic Tab Navigation switches views smoothly", async () => {
    // Click MEV Tab
    await page.click("#tabBtnMev");
    expect(await page.$eval("#tabPanelMev", (el) => el.classList.contains("hidden"))).toBe(false);
    const mevTierText = await page.$eval("#tabMevTier", (el) => el.textContent?.trim());
    expect(mevTierText).toBe("CRITICAL");

    // Click Simulation Tab
    await page.click("#tabBtnSim");
    expect(await page.$eval("#tabPanelSim", (el) => el.classList.contains("hidden"))).toBe(false);

    // Click JSON Tab
    await page.click("#tabBtnJson");
    expect(await page.$eval("#tabPanelJson", (el) => el.classList.contains("hidden"))).toBe(false);
    const jsonText = await page.$eval("#jsonOutput", (el) => el.textContent?.trim());
    expect(jsonText).toContain("BLOCKED");
    expect(jsonText).toContain("mevReport");

    // Return to Rug Tab
    await page.click("#tabBtnRug");
    expect(await page.$eval("#tabPanelRug", (el) => el.classList.contains("hidden"))).toBe(false);
  }, 10000);

  test("B7: Copy JSON diagnostic action triggers toast confirmation", async () => {
    await page.click("#btnCopyJson");

    await page.waitForFunction(
      () => {
        const toast = document.getElementById("toast");
        return toast && !toast.classList.contains("opacity-0");
      },
      { timeout: 5000 }
    );

    const toastMsg = await page.$eval("#toastMsg", (el) => el.textContent?.trim());
    expect(toastMsg).toMatch(/copied/i);
  }, 10000);

  test("B8: Slippage input and range slider synchronize reactively", async () => {
    await page.evaluate(() => {
      const input = document.getElementById("inputSlippage") as HTMLInputElement;
      input.value = "120";
      input.dispatchEvent(new Event("input"));
    });

    const percentText = await page.$eval("#slippagePercent", (el) => el.textContent?.trim());
    expect(percentText).toBe("1.20%");

    const sliderValue = await page.$eval("#sliderSlippage", (el: any) => el.value);
    expect(sliderValue).toBe("120");
  }, 10000);

  test("B9: Custom proposal parameter submission triggers audit and updates telemetry", async () => {
    await page.evaluate(() => {
      const inputMint = document.getElementById("inputMint") as HTMLInputElement;
      const inputOutput = document.getElementById("inputExpectedOutput") as HTMLInputElement;
      const inputSlippage = document.getElementById("inputSlippage") as HTMLInputElement;
      inputMint.value = "CustomToken11111111111111111111111111111111";
      inputOutput.value = "7777777";
      inputSlippage.value = "80";
      inputSlippage.dispatchEvent(new Event("input"));
    });

    await page.click("#btnAudit");

    await page.waitForFunction(
      () => {
        const json = document.getElementById("jsonOutput");
        return json && json.textContent?.includes("CustomToken11111111111111111111111111111111");
      },
      { timeout: 5000 }
    );

    const jsonText = await page.$eval("#jsonOutput", (el) => el.textContent?.trim());
    expect(jsonText).toContain("CustomToken11111111111111111111111111111111");
    expect(jsonText).toContain("7777777");
  }, 10000);

  test("B10: Adversarial Malformed Input handling fails-closed cleanly without crashing", async () => {
    await page.evaluate(() => {
      const input = document.getElementById("inputMint") as HTMLInputElement;
      input.value = "MalformedNotBase58!!!";
    });

    await page.click("#btnAudit");

    await page.waitForFunction(
      () => {
        const score = parseInt(document.getElementById("scoreValue")?.textContent || "0", 10);
        return score === 100;
      },
      { timeout: 5000 }
    );

    const verdictText = await page.$eval("#verdictText", (el) => el.textContent?.trim());
    expect(verdictText).toContain("BLOCKED");

    const threatScore = await page.$eval("#scoreValue", (el) =>
      parseInt(el.textContent || "0", 10)
    );
    expect(threatScore).toBe(100);
  }, 10000);
});
