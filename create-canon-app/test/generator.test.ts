import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '..', 'bin', 'index.js');

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runGenerator(cwd: string, projectName: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [binPath, projectName], {
      cwd,
      env: { ...process.env, npm_config_user_agent: 'npm/10.0.0' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe('create-canon-app', () => {
  let tempDir: string;
  const projectName = 'test-canon-app';

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'canon-generator-'));
    await runGenerator(tempDir, projectName);
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('creates project directory', async () => {
    const projectPath = join(tempDir, projectName);
    expect(await fileExists(projectPath)).toBe(true);
  });

  it('creates package.json with correct name', async () => {
    const pkgPath = join(tempDir, projectName, 'package.json');
    expect(await fileExists(pkgPath)).toBe(true);

    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    expect(pkg.name).toBe(projectName);
    expect(pkg.dependencies).toHaveProperty('canon-observability');
    expect(pkg.dependencies).toHaveProperty('express');
    expect(pkg.devDependencies).toHaveProperty('tsx');
    expect(pkg.devDependencies).toHaveProperty('typescript');
    expect(pkg.devDependencies).toHaveProperty('@types/express');
    expect(pkg.scripts).toHaveProperty('dev');
    expect(pkg.scripts).toHaveProperty('build');
    expect(pkg.scripts).toHaveProperty('start');
  });

  it('creates src/index.ts', async () => {
    const indexPath = join(tempDir, projectName, 'src', 'index.ts');
    expect(await fileExists(indexPath)).toBe(true);

    const content = await readFile(indexPath, 'utf-8');
    expect(content).toContain("from 'canon-observability'");
    expect(content).toContain('canonExpress');
    expect(content).toContain('canonExpressError');
    expect(content).toContain('/checkout');
    expect(content).toContain('/health');
    expect(content).toContain('/abort');
  });

  it('creates tsconfig.json', async () => {
    const tsconfigPath = join(tempDir, projectName, 'tsconfig.json');
    expect(await fileExists(tsconfigPath)).toBe(true);

    const content = await readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);

    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(tsconfig.compilerOptions.rootDir).toBe('src');
  });

  it('creates .gitignore', async () => {
    const gitignorePath = join(tempDir, projectName, '.gitignore');
    expect(await fileExists(gitignorePath)).toBe(true);

    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('dist');
  });

  it('creates README.md', async () => {
    const readmePath = join(tempDir, projectName, 'README.md');
    expect(await fileExists(readmePath)).toBe(true);

    const content = await readFile(readmePath, 'utf-8');
    expect(content).toContain(projectName);
    expect(content).toContain('curl');
    expect(content).toContain('/checkout');
  });
});

