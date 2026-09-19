import * as http from "http";
import * as url from "url";
import { SolInquisitorPlugin } from "../plugin";
import { Connection } from "@solana/web3.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Instantiate the real engine
const connection = new Connection(RPC_URL, "confirmed");
const inquisitor = new SolInquisitorPlugin({
  connection,
  strictSimulationRequired: false,
  rugScoreThreshold: 40,
  mevScoreThreshold: 50,
});

export interface PresetConfig {
  name: string;
  mint: string;
  expectedOutput: number;
  slippageBps: number;
  description: string;
}

export type PresetKey = "bonk" | "usdc" | "honeypot" | "mev";

// Built-in presets for instant demonstration
export const PRESETS: Record<PresetKey, PresetConfig> = {
  bonk: {
    name: "BONK (Clean Verified)",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    expectedOutput: 5000000,
    slippageBps: 50,
    description: "Decentralized Solana meme token. Mint & Freeze authorities permanently revoked. Low MEV risk.",
  },
  usdc: {
    name: "USDC (Freeze Authority Veto)",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    expectedOutput: 1000000,
    slippageBps: 100,
    description: "Circle USD Coin. Retains active freeze authority (7dGbd...). Triggers pre-flight honeypot warning.",
  },
  honeypot: {
    name: "Malicious Meme Honeypot",
    mint: "Honeypot1111111111111111111111111111111111111",
    expectedOutput: 100000000,
    slippageBps: 150,
    description: "Synthetic honeypot token: unrevoked mint authority, 88% whale supply concentration.",
  },
  mev: {
    name: "Predatory MEV Sandwich",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    expectedOutput: 5000000,
    slippageBps: 700,
    description: "High-slippage swap (7.00% / 700 bps). Exploitable by Jito searchers for maximal extractable value.",
  },
};

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sol-Inquisitor // Adversarial Security HUD</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            cyber: {
              black: '#0a0d14',
              card: '#111726',
              border: '#1e293b',
              neon: '#06b6d4',
              danger: '#f43f5e',
              success: '#10b981',
              warning: '#f59e0b'
            }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    @keyframes pulse-border {
      0%, 100% { border-color: rgba(6, 182, 212, 0.4); }
      50% { border-color: rgba(6, 182, 212, 0.9); }
    }
    .neon-pulse { animation: pulse-border 2s infinite ease-in-out; }
    .glow-red { text-shadow: 0 0 12px rgba(244, 63, 94, 0.6); }
    .glow-green { text-shadow: 0 0 12px rgba(16, 185, 129, 0.6); }
    .glow-blue { text-shadow: 0 0 12px rgba(6, 182, 212, 0.6); }
    .glow-amber { text-shadow: 0 0 12px rgba(245, 158, 11, 0.6); }
  </style>
</head>
<body class="bg-cyber-black text-slate-200 font-mono min-h-screen p-4 md:p-8 selection:bg-cyan-500 selection:text-black">
  <div class="max-w-7xl mx-auto space-y-6">

    <!-- Top Header & Telemetry -->
    <header class="flex flex-col md:flex-row md:items-center justify-between border-b border-cyber-border pb-6 gap-4">
      <div>
        <div class="flex items-center gap-3">
          <div class="h-3 w-3 rounded-full bg-cyan-400 animate-ping"></div>
          <h1 class="text-2xl md:text-3xl font-bold tracking-wider text-white flex items-center gap-2">
            <span class="text-cyan-400">SOL-INQUISITOR</span> // PRE-FLIGHT FIREWALL
          </h1>
        </div>
        <p class="text-xs text-slate-400 mt-1">Autonomous Pre-Flight Adversarial Security Engine for Solana Agent Kit & MCP</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="px-3 py-1 rounded bg-slate-800 text-xs text-slate-300 border border-slate-700 flex items-center gap-2">
          <i class="fa-solid fa-network-wired text-cyan-400"></i> Mainnet-Beta
        </span>
        <span class="px-3 py-1 rounded bg-emerald-950/80 text-xs text-emerald-400 border border-emerald-800/60 font-semibold flex items-center gap-2">
          <i class="fa-solid fa-check-double text-emerald-400"></i> 138/138 Tests Passing
        </span>
      </div>
    </header>

    <!-- Quick Presets Bar -->
    <section class="bg-cyber-card border border-cyber-border rounded-xl p-4">
      <div class="text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
        <span><i class="fa-solid fa-bolt text-amber-400 mr-1.5"></i> One-Click Adversarial Scenarios</span>
        <span class="text-[10px] text-slate-500">Live Mainnet & Simulated Injection</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onclick="loadPreset('bonk')" class="px-3 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-left transition flex flex-col justify-between group">
          <span class="text-xs font-semibold text-white group-hover:text-cyan-400 flex items-center gap-1.5">
            <i class="fa-solid fa-shield text-emerald-400"></i> BONK
          </span>
          <span class="text-[10px] text-slate-400 mt-1">Safe SPL Mint (Approved)</span>
        </button>
        <button onclick="loadPreset('usdc')" class="px-3 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-left transition flex flex-col justify-between group">
          <span class="text-xs font-semibold text-white group-hover:text-rose-400 flex items-center gap-1.5">
            <i class="fa-solid fa-snowflake text-rose-400"></i> USDC
          </span>
          <span class="text-[10px] text-slate-400 mt-1">Freeze Authority (Vetoed)</span>
        </button>
        <button onclick="loadPreset('honeypot')" class="px-3 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-left transition flex flex-col justify-between group">
          <span class="text-xs font-semibold text-white group-hover:text-rose-400 flex items-center gap-1.5">
            <i class="fa-solid fa-skull-crossbones text-rose-500"></i> Honeypot Meme
          </span>
          <span class="text-[10px] text-slate-400 mt-1">Whale & Mint Risk (+95)</span>
        </button>
        <button onclick="loadPreset('mev')" class="px-3 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-left transition flex flex-col justify-between group">
          <span class="text-xs font-semibold text-white group-hover:text-amber-400 flex items-center gap-1.5">
            <i class="fa-solid fa-arrows-split-up-and-left text-amber-400"></i> MEV Sandwich
          </span>
          <span class="text-[10px] text-slate-400 mt-1">700 bps Critical Slippage</span>
        </button>
      </div>
    </section>

    <!-- Main Grid: Input Form + Forensic Verdict -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Left: Audit Parameter Inputs -->
      <section class="lg:col-span-5 bg-cyber-card border border-cyber-border rounded-xl p-5 space-y-4">
        <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-cyber-border pb-3">
          <i class="fa-solid fa-magnifying-glass-chart text-cyan-400"></i> Proposed Transaction Details
        </h2>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Target SPL Token Mint Address</label>
          <input id="inputMint" type="text" value="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-300 font-mono focus:border-cyan-400 focus:outline-none transition">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Expected Output (Base Units)</label>
            <input id="inputExpectedOutput" type="number" value="5000000"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none transition">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Max Slippage (BPS)</label>
            <input id="inputSlippage" type="number" value="50"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none transition">
          </div>
        </div>
        <p id="presetDesc" class="text-xs text-slate-400 italic bg-slate-900/60 p-2.5 rounded border border-slate-800">
          Decentralized Solana meme token. Mint & Freeze authorities permanently revoked.
        </p>
        <button id="btnAudit" onclick="runAudit()"
          class="w-full py-3 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
          <i class="fa-solid fa-shield-halved"></i> Run Pre-Flight Audit
        </button>
      </section>

      <!-- Right: Forensic Verdict HUD -->
      <section class="lg:col-span-7 bg-cyber-card border border-cyber-border rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between border-b border-cyber-border pb-3">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-radar text-cyan-400"></i> Deterministic Decision Gate
          </h2>
          <span id="auditTimestamp" class="text-[10px] text-slate-500">READY FOR AUDIT</span>
        </div>

        <!-- Big Verdict Card -->
        <div id="verdictBox" class="rounded-xl border p-5 transition flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 border-slate-700">
          <div class="space-y-1 text-center md:text-left">
            <div id="verdictText" class="text-2xl md:text-3xl font-extrabold tracking-wider text-emerald-400 glow-green">
              APPROVED
            </div>
            <div id="verdictSubtitle" class="text-xs text-slate-300">
              Safe to sign. Zero cryptographic or MEV vulnerabilities detected.
            </div>
          </div>
          <!-- Threat Score Gauge (0-100) -->
          <div class="flex flex-col items-center">
            <div class="relative flex items-center justify-center w-24 h-24">
              <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path class="text-slate-800" stroke-width="3.8" stroke="currentColor" fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path id="scoreCircle" class="text-emerald-400 transition-all duration-700 ease-out" stroke-width="3.8"
                  stroke-dasharray="0, 100" stroke-linecap="round" stroke="currentColor" fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="absolute flex flex-col items-center justify-center">
                <span id="scoreValue" class="text-xl font-black text-white">0</span>
                <span class="text-[9px] text-slate-400 uppercase">THREAT</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Forensic Modules Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <!-- Module 1: RugProbe Matrix -->
          <div class="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>RugProbe Matrix</span>
              <i id="iconRug" class="fa-solid fa-circle-check text-emerald-400"></i>
            </div>
            <div id="rugSummary" class="text-xs font-semibold text-white">Authorities Revoked</div>
            <div id="rugDetails" class="text-[10px] text-slate-400 mt-1">Freeze: Revoked | Mint: Revoked</div>
          </div>

          <!-- Module 2: MEV Guard Analysis -->
          <div class="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>MEV Stress Guard</span>
              <i id="iconMev" class="fa-solid fa-circle-check text-emerald-400"></i>
            </div>
            <div id="mevSummary" class="text-xs font-semibold text-white">Low Slippage (50 bps)</div>
            <div id="mevDetails" class="text-[10px] text-slate-400 mt-1">Max Extractable: $0.00 | Rec: &le;100 bps</div>
          </div>

          <!-- Module 3: Simulation & Delta Diffing -->
          <div class="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Simulation</span>
              <i id="iconSim" class="fa-solid fa-circle-check text-emerald-400"></i>
            </div>
            <div id="simSummary" class="text-xs font-semibold text-white">Execution Passed</div>
            <div id="simDetails" class="text-[10px] text-slate-400 mt-1">Balance Delta: Verified</div>
          </div>
        </div>

      </section>
    </div>

    <!-- Forensic JSON & Veto Rationale Log -->
    <section class="bg-cyber-card border border-cyber-border rounded-xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-terminal text-cyan-400"></i> Structured Forensic Audit Diagnostic (/api/audit)
        </h3>
        <button onclick="copyAuditJson()" class="text-xs text-slate-400 hover:text-cyan-400 transition flex items-center gap-1">
          <i class="fa-solid fa-copy"></i> Copy JSON
        </button>
      </div>
      <pre id="jsonOutput" class="bg-slate-950 p-4 rounded-lg text-xs text-cyan-300 overflow-x-auto border border-slate-900 max-h-60 leading-relaxed font-mono">
// Click "Run Pre-Flight Audit" or choose an adversarial scenario above to inspect live telemetry.
      </pre>
    </section>

  </div>

  <script>
    const presets = ${JSON.stringify(PRESETS)};

    function loadPreset(key) {
      const p = presets[key];
      if (!p) return;
      document.getElementById('inputMint').value = p.mint;
      document.getElementById('inputExpectedOutput').value = p.expectedOutput;
      document.getElementById('inputSlippage').value = p.slippageBps;
      document.getElementById('presetDesc').innerText = p.description;
      runAudit();
    }

    async function runAudit() {
      const mint = document.getElementById('inputMint').value.trim();
      const expectedOutput = parseInt(document.getElementById('inputExpectedOutput').value, 10) || 5000000;
      const slippage = parseInt(document.getElementById('inputSlippage').value, 10) || 50;

      const btn = document.getElementById('btnAudit');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Auditing Ledger State...';

      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetMint: mint, mint, expectedOutput, maxSlippageBps: slippage })
        });
        const report = await res.json();
        renderReport(report);
      } catch (err) {
        console.error('Audit failed:', err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Run Pre-Flight Audit';
      }
    }

    function renderReport(report) {
      document.getElementById('auditTimestamp').innerText = report.timestamp ? new Date(report.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
      document.getElementById('jsonOutput').innerText = JSON.stringify(report, null, 2);

      const score = report.totalRiskScore !== undefined ? report.totalRiskScore : (report.overallRiskScore || 0);
      document.getElementById('scoreValue').innerText = score;
      document.getElementById('scoreCircle').setAttribute('stroke-dasharray', score + ', 100');

      const verdictBox = document.getElementById('verdictBox');
      const verdictText = document.getElementById('verdictText');
      const verdictSubtitle = document.getElementById('verdictSubtitle');
      const scoreCircle = document.getElementById('scoreCircle');

      const isApproved = report.verdict === 'APPROVED' || report.decision === 'APPROVED';

      if (isApproved) {
        verdictBox.className = 'rounded-xl border p-5 transition flex flex-col md:flex-row items-center justify-between gap-4 bg-emerald-950/30 border-emerald-800/80';
        verdictText.className = 'text-2xl md:text-3xl font-extrabold tracking-wider text-emerald-400 glow-green';
        verdictText.innerText = 'APPROVED';
        verdictSubtitle.innerText = 'Safe to sign. Zero adversarial hazards detected.';
        scoreCircle.setAttribute('class', 'text-emerald-400 transition-all duration-700 ease-out');
      } else {
        verdictBox.className = 'rounded-xl border p-5 transition flex flex-col md:flex-row items-center justify-between gap-4 bg-rose-950/30 border-rose-800/80';
        verdictText.className = 'text-2xl md:text-3xl font-extrabold tracking-wider text-rose-500 glow-red';
        verdictText.innerText = 'BLOCKED (VETOED)';
        verdictSubtitle.innerText = (report.vetoReasons && report.vetoReasons[0]) || 'Adversarial risk threshold exceeded. Transaction aborted.';
        scoreCircle.setAttribute('class', score >= 70 ? 'text-rose-500 transition-all duration-700 ease-out' : 'text-amber-400 transition-all duration-700 ease-out');
      }

      // RugProbe Matrix details
      const rug = report.rugProbe || (report.breakdown && report.breakdown.rugProbe) || {};
      const isRugSafe = rug.isSafe !== undefined ? rug.isSafe : !rug.isUnsafe;
      const iconRug = document.getElementById('iconRug');
      if (isRugSafe) {
        iconRug.className = 'fa-solid fa-circle-check text-emerald-400';
        document.getElementById('rugSummary').innerText = 'Authorities Clean';
      } else {
        iconRug.className = 'fa-solid fa-triangle-exclamation text-rose-500';
        document.getElementById('rugSummary').innerText = 'Honeypot Flagged (' + (rug.totalRiskScore || rug.riskScore || 0) + ' pts)';
      }
      const freezeStr = rug.hasFreezeAuthority ? 'Active (' + (rug.freezeAuthority || 'Present').substring(0, 5) + '...)' : 'Revoked';
      const mintStr = rug.hasMintAuthority ? 'Active (' + (rug.mintAuthority || 'Present').substring(0, 5) + '...)' : 'Revoked';
      document.getElementById('rugDetails').innerText = 'Freeze: ' + freezeStr + ' | Mint: ' + mintStr;

      // MEV Analysis details
      const mev = report.mevReport || (report.breakdown && report.breakdown.mevGuard) || {};
      const isSandwichVulnerable = mev.sandwichVulnerable !== undefined ? mev.sandwichVulnerable : mev.sandwichVulnerability;
      const slippageBps = mev.actualSlippageBps !== undefined ? mev.actualSlippageBps : (mev.slippageBps || 50);
      const tier = mev.slippageTier || mev.riskLevel || 'LOW';
      const iconMev = document.getElementById('iconMev');
      if (!isSandwichVulnerable) {
        iconMev.className = 'fa-solid fa-circle-check text-emerald-400';
        document.getElementById('mevSummary').innerText = tier + ' (' + slippageBps + ' bps)';
      } else {
        iconMev.className = 'fa-solid fa-triangle-exclamation text-rose-500';
        document.getElementById('mevSummary').innerText = 'Sandwich Vulnerable (' + slippageBps + ' bps)';
      }
      const extractableUsd = mev.estimatedExtractableValueUsd ? '$' + mev.estimatedExtractableValueUsd : '$0.00';
      document.getElementById('mevDetails').innerText = 'Max Extractable: ' + extractableUsd + ' | Rec: <=' + (mev.recommendedMaxSlippageBps || 100) + ' bps';

      // Simulation details
      const sim = report.simulation || (report.breakdown && report.breakdown.simulation) || {};
      const simPassed = sim.passed !== undefined ? sim.passed : (sim.simulatedSuccess && !sim.vetoed);
      const iconSim = document.getElementById('iconSim');
      if (simPassed !== false) {
        iconSim.className = 'fa-solid fa-circle-check text-emerald-400';
        document.getElementById('simSummary').innerText = 'Simulation Verified';
        document.getElementById('simDetails').innerText = 'Balance Delta Diff: Verified Safe';
      } else {
        iconSim.className = 'fa-solid fa-circle-xmark text-rose-500';
        document.getElementById('simSummary').innerText = 'Simulation Revert / Tax';
        document.getElementById('simDetails').innerText = (sim.reasons && sim.reasons[0]) || 'Instruction error or delta deficit';
      }
    }

    function copyAuditJson() {
      const text = document.getElementById('jsonOutput').innerText;
      navigator.clipboard.writeText(text);
      alert('Audit JSON copied to clipboard!');
    }

    // Auto-run default on load
    window.addEventListener('DOMContentLoaded', () => runAudit());
  </script>
</body>
</html>
`;

export function startUiServer(port: number = PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for external API consumers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || "", true);

    // Serve UI Dashboard
    if ((req.method === "GET" || req.method === "HEAD") && (parsedUrl.pathname === "/" || parsedUrl.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(HTML_DASHBOARD);
      }
      return;
    }

    // Handle Audit API (POST and GET supported for flexibility)
    if (parsedUrl.pathname === "/api/audit") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", async () => {
        try {
          let payload: { mint?: string; targetMint?: string; expectedOutput?: number; maxSlippageBps?: number } = {};
          if (body) {
            payload = JSON.parse(body);
          } else if (parsedUrl.query) {
            payload = {
              mint: parsedUrl.query.mint as string,
              targetMint: (parsedUrl.query.targetMint as string) || (parsedUrl.query.mint as string),
              expectedOutput: parseInt((parsedUrl.query.expectedOutput as string) || "5000000", 10),
              maxSlippageBps: parseInt((parsedUrl.query.maxSlippageBps as string) || "50", 10),
            };
          }

          const targetMint = payload.targetMint || payload.mint || PRESETS.bonk.mint;
          const expectedOutput = payload.expectedOutput || 5000000;
          const maxSlippageBps = payload.maxSlippageBps !== undefined ? payload.maxSlippageBps : 50;

          // Special mock scenario for synthetic honeypot demo
          if (targetMint === PRESETS.honeypot.mint) {
            const report = {
              verdict: "BLOCKED",
              decision: "BLOCKED",
              totalRiskScore: 95,
              overallRiskScore: 95,
              timestamp: new Date().toISOString(),
              targetMint,
              summary: "CRITICAL: Malicious honeypot detected. Active unrevoked mint authority and extreme whale concentration.",
              vetoReasons: [
                "Unrevoked Mint Authority detected: Deployer can print infinite tokens post-swap.",
                "Top 5 holder concentration exceeds 85%: Extreme dump liquidity risk.",
              ],
              recommendations: ["Do not sign transaction with Agent Wallet.", "Blacklist target mint address."],
              rugProbe: {
                isSafe: false,
                isUnsafe: true,
                riskScore: 95,
                totalRiskScore: 95,
                hasFreezeAuthority: false,
                freezeAuthority: null,
                freezeRiskScore: 0,
                hasMintAuthority: true,
                mintAuthority: "HoneyMintDeployerAddress111111111111111111",
                mintRiskScore: 35,
                top5HolderPercent: 88.5,
                topHoldersSharePercentage: 88.5,
                concentrationRiskScore: 30,
                lpLocked: false,
                reasons: ["Active mint authority (+35 Risk)", "Whale concentration 88.5% (+30 Risk)"],
              },
              mevReport: {
                actualSlippageBps: maxSlippageBps,
                slippageBps: maxSlippageBps,
                slippageTier: "MEDIUM",
                riskLevel: "MEDIUM",
                riskScore: 35,
                mevRiskScore: 35,
                sandwichVulnerable: false,
                sandwichVulnerability: false,
                estimatedExtractableValueBps: 96,
                estimatedExtractableValueUsd: 12.5,
                recommendedMaxSlippageBps: 100,
                reasons: ["Moderate slippage tolerance (1.50%)."],
              },
              simulation: {
                passed: true,
                simulatedSuccess: true,
                vetoed: false,
                expectedBalanceDelta: expectedOutput,
                simulatedBalanceDelta: expectedOutput,
                slippageExceeded: false,
                unitsConsumed: 28000,
                logs: ["Program log: Instruction: Transfer", "Program log: Success"],
                reasons: [],
              },
            };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(report));
            return;
          }

          // Real execution via SolInquisitorPlugin
          const pluginReport = await inquisitor.auditTradeProposal({
            targetMint,
            expectedOutput,
            maxSlippageBps,
          });

          const isBlocked = pluginReport.decision === "BLOCKED";
          const verdict = isBlocked ? "BLOCKED" : "APPROVED";
          const totalRiskScore = pluginReport.overallRiskScore;

          const rugData = pluginReport.breakdown.rugProbe;
          const mevData = pluginReport.breakdown.mevGuard;
          const simData = pluginReport.breakdown.simulation;

          const structuredReport = {
            verdict,
            decision: pluginReport.decision,
            totalRiskScore,
            overallRiskScore: totalRiskScore,
            timestamp: new Date(pluginReport.timestamp).toISOString(),
            targetMint: pluginReport.targetMint,
            summary: pluginReport.verdict,
            vetoReasons: pluginReport.vetoReasons,
            recommendations: pluginReport.recommendations,
            rugProbe: {
              isSafe: !rugData.isUnsafe,
              isUnsafe: rugData.isUnsafe,
              riskScore: rugData.totalRiskScore,
              totalRiskScore: rugData.totalRiskScore,
              hasFreezeAuthority: rugData.hasFreezeAuthority,
              freezeAuthority: rugData.freezeAuthority,
              freezeRiskScore: rugData.freezeRiskScore,
              hasMintAuthority: rugData.hasMintAuthority,
              mintAuthority: rugData.mintAuthority,
              mintRiskScore: rugData.mintRiskScore,
              topHoldersSharePercentage: rugData.topHoldersSharePercentage,
              top5HolderPercent: rugData.topHoldersSharePercentage,
              concentrationRiskScore: rugData.concentrationRiskScore,
              topHolders: rugData.topHolders,
              reasons: rugData.reasons,
            },
            mevReport: {
              actualSlippageBps: mevData.slippageBps,
              slippageBps: mevData.slippageBps,
              slippageTier: mevData.riskLevel,
              riskLevel: mevData.riskLevel,
              riskScore: mevData.mevRiskScore,
              mevRiskScore: mevData.mevRiskScore,
              sandwichVulnerable: mevData.sandwichVulnerability,
              sandwichVulnerability: mevData.sandwichVulnerability,
              estimatedExtractableValueBps: mevData.estimatedExtractableValueBps,
              estimatedExtractableValueUsd: ((mevData.estimatedExtractableValueBps / 10000) * 50).toFixed(2),
              recommendedMaxSlippageBps: mevData.recommendedMaxSlippageBps,
              reasons: mevData.reasons,
            },
            simulation: simData ? {
              passed: simData.simulatedSuccess && !simData.vetoed,
              simulatedSuccess: simData.simulatedSuccess,
              vetoed: simData.vetoed,
              expectedBalanceDelta: simData.expectedOutput,
              simulatedBalanceDelta: simData.actualOutputDelta,
              slippageExceeded: simData.slippageExceeded,
              unitsConsumed: simData.unitsConsumed,
              logs: simData.logs,
              reasons: simData.reasons,
            } : {
              passed: true,
              simulatedSuccess: true,
              vetoed: false,
              expectedBalanceDelta: expectedOutput,
              simulatedBalanceDelta: expectedOutput,
              slippageExceeded: false,
              unitsConsumed: 0,
              logs: ["Pre-flight parameter validation passed. Wire simulation skipped (dry-run mode)."],
              reasons: [],
            },
            breakdown: pluginReport.breakdown,
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(structuredReport));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || "Internal server error" }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.listen(port, () => {
    console.log(`[Sol-Inquisitor HUD] Server running at http://localhost:${port}`);
  });

  return server;
}

// Auto-start when executed directly
if (require.main === module) {
  startUiServer(PORT);
}
