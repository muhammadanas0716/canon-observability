#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function prompt(question, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const displayDefault = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${displayDefault}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  return 'npm';
}

async function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function loadTemplate(name) {
  const templatePath = join(__dirname, '..', 'templates', name);
  return readFile(templatePath, 'utf-8');
}

async function main() {
  console.log(`\n${BOLD}${CYAN}🔭 Create Canon App${RESET}\n`);
  console.log('Scaffold an Express app with Canon observability.\n');

  const args = process.argv.slice(2);
  let projectName = args[0];

  if (!projectName) {
    projectName = await prompt('Project name', 'canon-app');
  }

  const projectPath = join(process.cwd(), projectName);

  if (existsSync(projectPath)) {
    console.log(`\n${YELLOW}⚠ Directory "${projectName}" already exists.${RESET}`);
    process.exit(1);
  }

  console.log(`\nCreating ${CYAN}${projectName}${RESET}...\n`);

  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'src'), { recursive: true });

  const [packageJson, tsconfig, gitignore, srcIndex, readme] = await Promise.all([
    loadTemplate('package.json.template'),
    loadTemplate('tsconfig.json.template'),
    loadTemplate('gitignore.template'),
    loadTemplate('src/index.ts.template'),
    loadTemplate('README.md.template'),
  ]);

  const finalPackageJson = packageJson.replace(/{{PROJECT_NAME}}/g, projectName);
  const finalReadme = readme.replace(/{{PROJECT_NAME}}/g, projectName);

  await Promise.all([
    writeFile(join(projectPath, 'package.json'), finalPackageJson),
    writeFile(join(projectPath, 'tsconfig.json'), tsconfig),
    writeFile(join(projectPath, '.gitignore'), gitignore),
    writeFile(join(projectPath, 'src', 'index.ts'), srcIndex),
    writeFile(join(projectPath, 'README.md'), finalReadme),
  ]);

  console.log(`${GREEN}✓${RESET} Created project files`);

  const pm = detectPackageManager();
  console.log(`\nInstalling dependencies with ${CYAN}${pm}${RESET}...`);

  const installSuccess = await runCommand(pm, ['install'], projectPath);

  console.log(`\n${BOLD}${GREEN}✓ Done!${RESET}\n`);

  if (!installSuccess) {
    console.log(`${YELLOW}Dependencies not installed. Run manually:${RESET}\n`);
    console.log(`  cd ${projectName}`);
    console.log(`  ${pm} install\n`);
  }

  const runCmd = pm === 'npm' ? 'npm run' : pm;

  console.log(`${BOLD}Next steps:${RESET}\n`);
  console.log(`  cd ${projectName}`);
  if (!installSuccess) console.log(`  ${pm} install`);
  console.log(`  ${runCmd} dev\n`);

  console.log(`${BOLD}Try these endpoints:${RESET}\n`);
  console.log(`  ${CYAN}curl http://localhost:3000/ok${RESET}`);
  console.log(`  ${CYAN}curl http://localhost:3000/health${RESET}`);
  console.log(`  ${CYAN}curl -X POST http://localhost:3000/checkout -H "Content-Type: application/json" -d '{"cart_id":"cart_abc","total_cents":4999}'${RESET}`);
  console.log(`  ${CYAN}curl http://localhost:3000/slow${RESET}`);
  console.log(`  ${CYAN}curl http://localhost:3000/boom${RESET}`);
  console.log(`  ${CYAN}curl http://localhost:3000/abort${RESET}  ${YELLOW}(then Ctrl+C to abort)${RESET}\n`);

  console.log(`Watch stdout for ${CYAN}one JSON wide event per request${RESET}.\n`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

