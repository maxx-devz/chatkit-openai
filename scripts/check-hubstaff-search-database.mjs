import { spawn } from "node:child_process";
import path from "node:path";
const child=spawn(path.resolve(".venv",process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
  ["-m","unittest","discover","-s","chatkit_backend/tests","-p","test_hubstaff_search_database.py","-q"],
  {env:{...process.env,HUBSTAFF_SEARCH_TEST_DATABASE_URL:process.env.DATABASE_URL || ""},stdio:"inherit",windowsHide:true});
child.on("exit",code => {process.exitCode=code ?? 1;});
child.on("error",() => {console.error("Python database check could not start.");process.exitCode=1;});
