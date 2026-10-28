import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,access,rm,copyFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {setup,setupDryRun,runCommand} from "../scripts/setup.mjs";

async function fixture(t,options={}) {
  const temp=await mkdtemp(path.join(tmpdir(),"aoc-setup-"));
  t.after(() => rm(temp,{recursive:true,force:true}));
  const root=path.join(temp,"project with spaces");
  await mkdir(path.join(root,"chatkit_backend"),{recursive:true});
  for (const [name,text] of Object.entries({"package.json":"{}","package-lock.json":"{}",
    "chatkit_backend/requirements.txt":"example==1.0\n","chatkit_backend/.python-version":"3.13\r\n",
    ".env.example":"DATABASE_URL=\nCHATKIT_BACKEND_SECRET=\n","npm-cli.js":"// fixture only"})) {
    await writeFile(path.join(root,name),text);
  }
  const calls=[];
  const messages=[];
  return {root,calls,messages,args:{root,platform:"win32",nodeVersion:"22.12.0",node:process.execPath,
    npmCli:path.join(root,"npm-cli.js"),probe:()=>"3.13",run:async(...args)=>{calls.push(args);},
    log:text=>messages.push(text),...options}};
}

test("Fresh setup installs both dependency sets and creates a safe template",async t=>{
  const f=await fixture(t);
  await setup(f.args);
  assert.equal(f.calls.length,4);
  assert.deepEqual(f.calls[0][1],[path.join(f.root,"npm-cli.js"),"ci"]);
  assert.deepEqual(f.calls[1].slice(0,2),["py",["-3.13","-m","venv",path.join(f.root,".venv")]]);
  assert.deepEqual(f.calls[2][1],["-m","pip","install","-r",path.join(f.root,"chatkit_backend/requirements.txt")]);
  assert.deepEqual(f.calls[3][1],["-m","pip","check"]);
  assert.equal(await readFile(path.join(f.root,".env.local"),"utf8"),await readFile(path.join(f.root,".env.example"),"utf8"));
  assert.ok(f.calls.every(([,args,options])=>Array.isArray(args)&&options.cwd===f.root));
  assert.match(f.messages.join("\n"),/No database migrations, cloud changes, secret generation/);
});

test("Existing credentials are preserved byte for byte and never logged",async t=>{
  const f=await fixture(t);
  const original="DATABASE_URL=synthetic-private-marker\r\nCUSTOM_SETTING=keep-me\r\n";
  await writeFile(path.join(f.root,".env.local"),original);
  await setup(f.args);
  assert.equal(await readFile(path.join(f.root,".env.local"),"utf8"),original);
  assert.doesNotMatch(f.messages.join("\n"),/synthetic-private-marker|keep-me/);
});

test("An existing empty environment file is not overwritten",async t=>{
  const f=await fixture(t);
  await writeFile(path.join(f.root,".env.local"),"");
  await setup(f.args);
  assert.equal(await readFile(path.join(f.root,".env.local"),"utf8"),"");
  assert.match(f.messages.join("\n"),/If it is empty/);
});

test("Existing valid venv is reused; no recreation command",async t=>{
  const f=await fixture(t);
  await mkdir(path.join(f.root,".venv/Scripts"),{recursive:true});
  await writeFile(path.join(f.root,".venv/Scripts/python.exe"),"fixture");
  await setup(f.args);
  assert.equal(f.calls.length,3);
  assert.ok(f.calls.every(([,args])=>!args.includes("venv")));
});

test("Incomplete or incompatible existing venv is preserved and stops setup",async t=>{
  const f=await fixture(t,{probe:()=>"3.12"});
  await mkdir(path.join(f.root,".venv/Scripts"),{recursive:true});
  const marker=path.join(f.root,".venv/Scripts/python.exe");
  await writeFile(marker,"preserve");
  await assert.rejects(setup(f.args),/Existing .venv.*preserved/);
  assert.equal(f.calls.length,0);
  assert.equal(await readFile(marker,"utf8"),"preserve");
});

test("Missing Python or old Node fails before installation or configuration writes",async t=>{
  for (const option of [{probe:()=>""},{nodeVersion:"20.18.1"}]) {
    const f=await fixture(t,option);
    await assert.rejects(setup(f.args),/Install (Python|Node.js)/);
    assert.equal(f.calls.length,0);
    await assert.rejects(access(path.join(f.root,".env.local")));
  }
});

test("Dry run previews only; no installs, venv or env writes",async t=>{
  const f=await fixture(t,{dryRun:true});
  await setup(f.args);
  assert.equal(f.calls.length,0);
  await assert.rejects(access(path.join(f.root,".env.local")));
  await assert.rejects(access(path.join(f.root,".venv")));
  assert.match(f.messages.join("\n"),/Would create .env.local/);
});

test("Preview is honored even when npm consumes the dry-run argument",()=>{
  assert.equal(setupDryRun(["--dry-run"],{}),true);
  assert.equal(setupDryRun([],{npm_config_dry_run:"true"}),true);
  assert.equal(setupDryRun([],{npm_config_dry_run:"1"}),true);
  assert.equal(setupDryRun([],{npm_config_dry_run:"false"}),false);
  assert.equal(setupDryRun([],{}),false);
});

test("Installation failure stops later steps without creating an env file",async t=>{
  const f=await fixture(t,{run:async()=>{throw new Error("synthetic install failed");}});
  await assert.rejects(setup(f.args),/synthetic install failed/);
  await assert.rejects(access(path.join(f.root,".env.local")));
});

test("Non-npm invocation and incomplete checkout stop before installs",async t=>{
  const f=await fixture(t,{npmCli:null});
  await assert.rejects(setup(f.args),/npm run setup/);
  assert.equal(f.calls.length,0);
  await rm(path.join(f.root,"package-lock.json"));
  await assert.rejects(setup({...f.args,npmCli:path.join(f.root,"npm-cli.js")}),/Missing package-lock.json/);
});

test("Unix setup chooses versioned Python and bin/python",async t=>{
  const f=await fixture(t,{platform:"linux"});
  await setup(f.args);
  assert.equal(f.calls[1][0],"python3.13");
  assert.equal(f.calls[2][0],path.join(f.root,".venv/bin/python"));
});

test("Bootstrap help runs from an isolated checkout without node_modules",async t=>{
  const f=await fixture(t);
  await mkdir(path.join(f.root,"scripts"));
  const target=path.join(f.root,"scripts/setup.mjs");
  await copyFile(fileURLToPath(new URL("../scripts/setup.mjs",import.meta.url)),target);
  const result=spawnSync(process.execPath,[target,"--help"],{cwd:f.root,encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/npm run setup/);
  await assert.rejects(access(path.join(f.root,"node_modules")));
});

test("Actual subprocess failures produce actionable messages",async()=>{
  await assert.rejects(runCommand(process.execPath,["-e","process.exit(7)"],{cwd:process.cwd(),label:"Synthetic check"}),/exit 7/);
});
