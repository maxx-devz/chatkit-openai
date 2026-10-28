// Fresh-checkout bootstrap. Uses Node built-ins so node_modules is not required.
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function setupDryRun(args,environment = process.env) {
  // npm can consume --dry-run rather than forwarding it to the script.
  return args.includes("--dry-run") || ["true","1"].includes(environment.npm_config_dry_run);
}

async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export function probePython(command, args = []) {
  const result = spawnSync(command, [...args,"-c","import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
    {encoding:"utf8",timeout:10_000,windowsHide:true,shell:false});
  return result.status === 0 ? result.stdout.trim() : "";
}

export function runCommand(command, args, {cwd,label}) {
  return new Promise((resolve,reject) => {
    const child = spawn(command,args,{cwd,stdio:"inherit",windowsHide:true,shell:false});
    child.on("error",() => reject(new Error(`${label} could not start. Check the installed tools and permissions.`)));
    child.on("exit",(code,signal) => code === 0 ? resolve()
      : reject(new Error(`${label} failed${signal ? ` (${signal})` : ` (exit ${code})`}. Fix the error above, then rerun npm run setup.`)));
  });
}

export async function setup({
  root = projectRoot, platform = process.platform, nodeVersion = process.versions.node,
  node = process.execPath, npmCli = process.env.npm_execpath,
  probe = probePython, run = runCommand, log = console.log, dryRun = false,
} = {}) {
  if (Number(nodeVersion.split(".")[0]) < 22) throw new Error("Install Node.js 22 or newer, reopen your terminal, then run npm run setup.");
  for (const file of ["package.json","package-lock.json","chatkit_backend/requirements.txt","chatkit_backend/.python-version",".env.example"]) {
    if (!await exists(path.join(root,file))) throw new Error(`Missing ${file}. Use the project root and the branch containing the complete portal setup.`);
  }
  const requiredPython = (await readFile(path.join(root,"chatkit_backend/.python-version"),"utf8")).trim();
  if (!/^\d+\.\d+$/.test(requiredPython)) throw new Error("Invalid Python version file; expected major.minor.");
  const venv = path.join(root,".venv");
  const python = path.join(venv,platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const haveVenv = await exists(venv);
  let base;
  if (haveVenv) {
    if (!await exists(python) || probe(python) !== requiredPython) {
      throw new Error(`Existing .venv is incomplete or not Python ${requiredPython}. It was preserved. Rename it as a backup and rerun setup, or repair it manually.`);
    }
    log(`Using existing Python ${requiredPython} .venv; it will not be recreated.`);
  } else {
    const candidates = platform === "win32"
      ? [["py",[`-${requiredPython}`]],[`python${requiredPython}`,[]],["python",[]],["python3",[]]]
      : [[`python${requiredPython}`,[]],["python3",[]],["python",[]]];
    base = candidates.find(([command,args]) => probe(command,args) === requiredPython);
    if (!base) throw new Error(`Install Python ${requiredPython} with venv/pip support, reopen your terminal, then run npm run setup. No dependencies or environment files were changed.`);
  }
  // Use npm's own CLI through Node; npm.cmd needs a shell on Windows.
  if (!npmCli || !/npm-cli\.(?:cjs|js)$/i.test(npmCli) || !await exists(npmCli)) {
    throw new Error("Run this script with npm run setup (not directly with node or another package manager).");
  }
  log(dryRun ? "Setup preview: no installs or files will be changed." : "Setting up this checkout. Stop any running dev servers before installing.");
  const step = async (label,command,args) => {
    log(label);
    if (dryRun) log(`  ${[command,...args].map(value => JSON.stringify(value)).join(" ")}`);
    else await run(command,args,{cwd:root,label});
  };
  await step("1/4 Install locked Node dependencies (npm ci)",node,[npmCli,"ci"]);
  if (!haveVenv) await step(`2/4 Create Python ${requiredPython} .venv`,base[0],[...base[1],"-m","venv",venv]);
  else log("2/4 Keep existing .venv");
  await step("3/4 Install pinned Python requirements",python,["-m","pip","install","-r",path.join(root,"chatkit_backend/requirements.txt")]);
  await step("4/4 Verify Python dependency compatibility",python,["-m","pip","check"]);

  const envFile = path.join(root,".env.local");
  if (dryRun) log(await exists(envFile) ? "Would preserve existing .env.local." : "Would create .env.local from .env.example.");
  else {
    try {
      await copyFile(path.join(root,".env.example"),envFile,constants.COPYFILE_EXCL);
      log("Created .env.local from the safe template. Restore/fill private credentials before starting.");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      log("Preserved existing .env.local unchanged. If it is empty, restore it or fill it using .env.example.");
    }
  }
  log("No database migrations, cloud changes, secret generation, or server starts were performed.");
  if (!dryRun) {
    log("Dependencies installed. Next: restore/fill .env.local, run npm run setup:check, then npm run dev.");
    log("Local and both Vercel services need the same intended DATABASE_URL to share data. Vercel variables are configured separately.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm run setup: install npm/Python dependencies and create .env.local only if missing. Requires Node 22+ and Python 3.13.\nPreview: npm run setup:preview. Options: --dry-run, --help. No database or Vercel changes.");
  } else if (args.some(arg => arg !== "--dry-run")) {
    console.error("Unknown setup option. Use npm run setup -- --help.");
    process.exitCode = 1;
  } else {
    try { await setup({dryRun:setupDryRun(args)}); }
    catch (error) { console.error(`Setup stopped: ${error.message}`); process.exitCode = 1; }
  }
}
