import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import type { CommandResult, RuntimeAdapter } from './types.js';
import { hasMakefileTarget } from '../utils/lifecycle-makefile.js';

export type JavaCommandRunner = (command: string, args: string[], cwd: string) => Promise<number>;
type JavaBuildTool = 'maven' | 'gradle';

export class JavaRuntimeAdapter implements RuntimeAdapter {
  readonly runtime = 'java' as const;

  constructor(private readonly runCommand: JavaCommandRunner) {}

  private isExecutable(filePath: string): boolean {
    if (process.platform === 'win32') return true;
    try {
      const stat = fs.statSync(filePath);
      return (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  private ensureWrapperExecutable(filePath: string): boolean {
    if (process.platform === 'win32') return true;
    if (this.isExecutable(filePath)) return true;

    try {
      fs.chmodSync(filePath, 0o755);
      return this.isExecutable(filePath);
    } catch {
      return false;
    }
  }

  private resolveJavaCommand(_projectPath?: string): string {
    const javaHome = process.env.JAVA_HOME?.trim();
    if (!javaHome) return 'java';
    const candidate = path.join(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java'
    );
    if (fs.existsSync(candidate)) return candidate;
    return 'java';
  }

  private parseMajorJavaVersion(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const trimmed = raw.trim().replace(/\"/g, '');
    const first = trimmed.split('.')[0];
    const value = Number.parseInt(first, 10);
    return Number.isFinite(value) ? value : null;
  }

  private readRequiredJavaMajor(projectPath: string): number {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (!fs.existsSync(pomPath)) return 21;
    try {
      const pomRaw = fs.readFileSync(pomPath, 'utf-8');
      const match = pomRaw.match(/<java\.version>\s*([^<\s]+)\s*<\/java\.version>/i);
      const major = this.parseMajorJavaVersion(match?.[1]);
      return major ?? 21;
    } catch {
      return 21;
    }
  }

  private async detectInstalledJavaMajor(javaCommand: string, cwd: string): Promise<number | null> {
    try {
      const result = await execa(javaCommand, ['-version'], { cwd, timeout: 5000, reject: false });
      if (result.exitCode !== 0) return null;

      const versionOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
      const versionMatch = versionOutput.match(/version\s+"([^"]+)"/i);
      if (versionMatch?.[1]) {
        return this.parseMajorJavaVersion(versionMatch[1]);
      }

      const runtimeMatch = versionOutput.match(/(?:openjdk|java)\s+(\d+(?:[._]\d+)?)/i);
      if (runtimeMatch?.[1]) {
        return this.parseMajorJavaVersion(runtimeMatch[1]);
      }

      return null;
    } catch {
      return null;
    }
  }

  private parseMavenVersion(raw: string | null | undefined): [number, number, number] | null {
    if (!raw) return null;
    const match = raw.match(/Apache Maven\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return null;
    return [
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10),
    ];
  }

  private isMavenVersionAtLeast(
    version: [number, number, number],
    min: [number, number, number]
  ): boolean {
    for (let i = 0; i < 3; i += 1) {
      if (version[i] > min[i]) return true;
      if (version[i] < min[i]) return false;
    }
    return true;
  }

  private async checkSystemMavenVersion(cwd: string): Promise<CommandResult> {
    try {
      const result = await execa('mvn', ['-version'], { cwd, timeout: 5000, reject: false });
      if (result.exitCode !== 0) {
        return {
          exitCode: result.exitCode || 1,
          message: 'Maven is required and must be available on PATH (3.9+).',
        };
      }

      const parsed = this.parseMavenVersion(`${result.stdout || ''}\n${result.stderr || ''}`);
      if (!parsed) {
        return {
          exitCode: 1,
          message: 'Unable to parse Maven version. Ensure Maven 3.9+ is installed and retry.',
        };
      }

      if (!this.isMavenVersionAtLeast(parsed, [3, 9, 0])) {
        return {
          exitCode: 1,
          message: `Maven ${parsed.join('.')} detected; Maven 3.9+ is required.`,
        };
      }

      return { exitCode: 0 };
    } catch {
      return {
        exitCode: 1,
        message: 'Maven version check failed. Install Maven 3.9+ and ensure mvn is on PATH.',
      };
    }
  }

  private shouldUseGradleNoDaemon(): boolean {
    return process.env.CI === 'true' || process.env.RAPIDKIT_GRADLE_NO_DAEMON === '1';
  }

  private inspectJavaProject(projectPath: string): {
    hasMavenProject: boolean;
    hasMavenWrapper: boolean;
    hasGradleProject: boolean;
    hasGradleWrapper: boolean;
  } {
    const hasPomXml = fs.existsSync(path.join(projectPath, 'pom.xml'));
    const hasMavenWrapper =
      fs.existsSync(path.join(projectPath, 'mvnw')) ||
      fs.existsSync(path.join(projectPath, 'mvnw.cmd'));
    const hasGradleBuild =
      fs.existsSync(path.join(projectPath, 'build.gradle')) ||
      fs.existsSync(path.join(projectPath, 'build.gradle.kts')) ||
      fs.existsSync(path.join(projectPath, 'settings.gradle')) ||
      fs.existsSync(path.join(projectPath, 'settings.gradle.kts'));
    const hasGradleWrapper =
      fs.existsSync(path.join(projectPath, 'gradlew')) ||
      fs.existsSync(path.join(projectPath, 'gradlew.bat'));

    return {
      hasMavenProject: hasPomXml || hasMavenWrapper,
      hasMavenWrapper,
      hasGradleProject: hasGradleBuild || hasGradleWrapper,
      hasGradleWrapper,
    };
  }

  private findWorkspaceRoot(startPath: string): string | null {
    let current = startPath;
    while (true) {
      if (fs.existsSync(path.join(current, '.rapidkit-workspace'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  private resolveDependencyMode(
    projectPath: string
  ): 'isolated' | 'shared-runtime-caches' | 'shared-node-deps' {
    const raw = process.env.RAPIDKIT_DEP_SHARING_MODE?.toLowerCase();
    if (raw === 'shared-runtime-caches' || raw === 'shared-node-deps' || raw === 'isolated') {
      return raw;
    }

    const workspace = this.findWorkspaceRoot(projectPath);
    if (!workspace) return 'isolated';

    const policyPath = path.join(workspace, '.rapidkit', 'policies.yml');
    if (!fs.existsSync(policyPath)) return 'isolated';

    try {
      const policyRaw = fs.readFileSync(policyPath, 'utf-8');
      const match = policyRaw.match(/^\s*dependency_sharing_mode:\s*([a-zA-Z\-]+)\s*(?:#.*)?$/m);
      const value = match?.[1]?.toLowerCase();
      if (
        value === 'shared-runtime-caches' ||
        value === 'shared-node-deps' ||
        value === 'isolated'
      ) {
        return value;
      }
    } catch {
      // Fallback to isolated.
    }

    return 'isolated';
  }

  private buildToolCommand(projectPath: string): { command: string; baseArgs: string[] } {
    if (this.isGradleProject(projectPath)) {
      return this.gradleCommand(projectPath);
    }

    return this.mavenCommand(projectPath);
  }

  private mavenCommand(projectPath: string): { command: string; baseArgs: string[] } {
    const mvnwCmd = path.join(projectPath, 'mvnw.cmd');
    if (process.platform === 'win32' && fs.existsSync(mvnwCmd)) {
      return { command: mvnwCmd, baseArgs: [] };
    }

    const mvnw = path.join(projectPath, 'mvnw');
    if (fs.existsSync(mvnw)) {
      if (!this.ensureWrapperExecutable(mvnw)) {
        return { command: 'sh', baseArgs: [mvnw] };
      }
      return { command: mvnw, baseArgs: [] };
    }

    return { command: 'mvn', baseArgs: [] };
  }

  private gradleCommand(projectPath: string): { command: string; baseArgs: string[] } {
    const gradlewCmd = path.join(projectPath, 'gradlew.bat');
    if (process.platform === 'win32' && fs.existsSync(gradlewCmd)) {
      return { command: gradlewCmd, baseArgs: [] };
    }

    const gradlew = path.join(projectPath, 'gradlew');
    if (fs.existsSync(gradlew)) {
      if (!this.ensureWrapperExecutable(gradlew)) {
        return { command: 'sh', baseArgs: [gradlew] };
      }
      return { command: gradlew, baseArgs: [] };
    }

    return { command: 'gradle', baseArgs: [] };
  }

  private isGradleProject(projectPath: string): boolean {
    return this.inspectJavaProject(projectPath).hasGradleProject;
  }

  private isMavenProject(projectPath: string): boolean {
    return this.inspectJavaProject(projectPath).hasMavenProject;
  }

  private discoverWorkspaceJavaProjects(workspacePath: string): string[] {
    const projects: string[] = [];
    const visited = new Set<string>();
    const queue = [workspacePath];

    while (queue.length > 0) {
      const currentPath = queue.shift();
      if (!currentPath || visited.has(currentPath)) {
        continue;
      }
      visited.add(currentPath);

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }
        if (
          ['node_modules', 'dist', 'build', 'target', 'coverage', 'htmlcov'].includes(entry.name)
        ) {
          continue;
        }

        const candidate = path.join(currentPath, entry.name);
        const inspection = this.inspectJavaProject(candidate);
        if (inspection.hasMavenProject || inspection.hasGradleProject) {
          projects.push(candidate);
        }

        queue.push(candidate);
      }
    }

    return projects;
  }

  private withJavaCacheEnv<T>(projectPath: string, fn: () => Promise<T>): Promise<T> {
    const mode = this.resolveDependencyMode(projectPath);
    const workspace = process.env.RAPIDKIT_WORKSPACE_PATH || this.findWorkspaceRoot(projectPath);
    const mavenCache =
      mode === 'shared-runtime-caches'
        ? path.join(workspace || projectPath, '.rapidkit', 'cache', 'java', 'm2')
        : path.join(projectPath, '.rapidkit', 'cache', 'java', 'm2');
    const gradleCache =
      mode === 'shared-runtime-caches'
        ? path.join(workspace || projectPath, '.rapidkit', 'cache', 'java', 'gradle')
        : path.join(projectPath, '.rapidkit', 'cache', 'java', 'gradle');

    const originalMavenOpts = process.env.MAVEN_OPTS;
    const originalGradleUserHome = process.env.GRADLE_USER_HOME;
    const repoOpt = `-Dmaven.repo.local=${mavenCache}`;
    process.env.MAVEN_OPTS = originalMavenOpts ? `${originalMavenOpts} ${repoOpt}` : repoOpt;
    process.env.GRADLE_USER_HOME = gradleCache;

    return fn().finally(() => {
      if (typeof originalMavenOpts === 'undefined') delete process.env.MAVEN_OPTS;
      else process.env.MAVEN_OPTS = originalMavenOpts;

      if (typeof originalGradleUserHome === 'undefined') delete process.env.GRADLE_USER_HOME;
      else process.env.GRADLE_USER_HOME = originalGradleUserHome;
    });
  }

  private async runBuildTool(
    projectPath: string,
    args: string[],
    requireBuildTool = true
  ): Promise<CommandResult> {
    return this.withJavaCacheEnv(projectPath, async () => {
      try {
        const { command, baseArgs } = this.buildToolCommand(projectPath);
        const exitCode = await this.runCommand(command, [...baseArgs, ...args], projectPath);
        if (exitCode === 0 || !requireBuildTool) {
          return { exitCode };
        }

        const hasPom = fs.existsSync(path.join(projectPath, 'pom.xml'));
        const hasGradle =
          fs.existsSync(path.join(projectPath, 'build.gradle')) ||
          fs.existsSync(path.join(projectPath, 'build.gradle.kts'));

        return {
          exitCode,
          message:
            hasPom || hasGradle
              ? 'Java build failed. Verify pom.xml/build.gradle syntax and dependencies, then retry.'
              : 'Java build tool is not installed or not available on PATH. Install Maven/Gradle and JDK 21+, or commit mvnw/gradlew wrapper scripts.',
        };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return {
          exitCode: 1,
          message: `Java command execution failed: ${details}. Verify pom.xml/build.gradle integrity and wrapper permissions.`,
        };
      }
    });
  }

  private resolveJarPath(projectPath: string): string | null {
    const outputDirs = [path.join(projectPath, 'target'), path.join(projectPath, 'build', 'libs')];

    for (const outputDir of outputDirs) {
      if (!fs.existsSync(outputDir)) continue;

      const entries = fs
        .readdirSync(outputDir)
        .filter((entry) => entry.toLowerCase().endsWith('.jar'));
      const candidate = entries.find(
        (entry) =>
          !entry.toLowerCase().endsWith('-sources.jar') &&
          !entry.toLowerCase().endsWith('-javadoc.jar') &&
          !entry.toLowerCase().endsWith('-plain.jar')
      );

      if (candidate) {
        return path.join(outputDir, candidate);
      }
    }

    return null;
  }

  private commandArgsFor(tool: JavaBuildTool, action: 'init' | 'dev' | 'test' | 'build'): string[] {
    if (tool === 'gradle') {
      const base = this.shouldUseGradleNoDaemon() ? ['--no-daemon'] : [];
      if (action === 'init') return [...base, 'dependencies'];
      if (action === 'dev') return [...base, 'bootRun'];
      if (action === 'test') return [...base, 'test'];
      return [...base, 'bootJar'];
    }

    if (action === 'init') return ['-B', '-q', '-DskipTests', 'dependency:go-offline'];
    if (action === 'dev') return ['spring-boot:run'];
    if (action === 'test') return ['test'];
    return ['-DskipTests', 'package'];
  }

  private detectBuildTool(projectPath: string): JavaBuildTool {
    return this.isGradleProject(projectPath) ? 'gradle' : 'maven';
  }

  async checkPrereqs(): Promise<CommandResult> {
    const cwd = process.cwd();
    const javaCommand = this.resolveJavaCommand(cwd);
    const javaCode = await this.runCommand(javaCommand, ['-version'], cwd);
    if (javaCode !== 0) {
      return {
        exitCode: javaCode,
        message: 'JDK 21+ is required. Ensure java is on PATH or JAVA_HOME/bin/java is available.',
      };
    }

    if (this.isMavenProject(cwd)) {
      const requiredMajor = this.readRequiredJavaMajor(cwd);
      const installedMajor = await this.detectInstalledJavaMajor(javaCommand, cwd);
      if (installedMajor !== null && installedMajor < requiredMajor) {
        return {
          exitCode: 1,
          message: `Detected Java ${installedMajor}, but project requires Java ${requiredMajor}+.`,
        };
      }

      const javaHomeReleasePath = path.join(process.env.JAVA_HOME || '', 'release');
      if (process.env.JAVA_HOME && fs.existsSync(javaHomeReleasePath)) {
        try {
          const release = fs.readFileSync(javaHomeReleasePath, 'utf-8');
          const match = release.match(/^JAVA_VERSION="([^"]+)"/m);
          const major = this.parseMajorJavaVersion(match?.[1]);
          if (major !== null && major < requiredMajor) {
            return {
              exitCode: 1,
              message: `Detected JAVA_HOME version ${major}, but project requires Java ${requiredMajor}+.`,
            };
          }
        } catch {
          // Ignore JAVA_HOME release parsing failures.
        }
      }
    }

    if (this.isMavenProject(cwd) || this.isGradleProject(cwd)) {
      const tool = this.detectBuildTool(cwd);
      const versionArgs = tool === 'gradle' ? ['--version'] : ['-version'];
      const result = await this.runBuildTool(cwd, versionArgs);
      if (result.exitCode !== 0) return result;

      if (tool === 'maven' && !this.inspectJavaProject(cwd).hasMavenWrapper) {
        return this.checkSystemMavenVersion(cwd);
      }

      return result;
    }

    const workspaceRoot = this.findWorkspaceRoot(cwd);
    if (workspaceRoot && workspaceRoot === cwd) {
      const javaProjects = this.discoverWorkspaceJavaProjects(workspaceRoot);
      if (javaProjects.length > 0) {
        // Enforce JDK version against the highest requirement across all nested projects.
        const maxRequiredMajor = javaProjects.reduce(
          (max, p) => Math.max(max, this.readRequiredJavaMajor(p)),
          0
        );
        if (maxRequiredMajor > 0) {
          const installedMajor = await this.detectInstalledJavaMajor(javaCommand, cwd);
          if (installedMajor !== null && installedMajor < maxRequiredMajor) {
            const offendingProjects = javaProjects
              .filter((p) => this.readRequiredJavaMajor(p) > installedMajor)
              .map((p) => path.relative(cwd, p))
              .join(', ');
            return {
              exitCode: 1,
              message: `Detected Java ${installedMajor}, but workspace project(s) [${offendingProjects}] require Java ${maxRequiredMajor}+.`,
            };
          }
        }

        let requiresMavenOnPath = false;
        let requiresGradleOnPath = false;

        for (const projectPath of javaProjects) {
          const inspection = this.inspectJavaProject(projectPath);
          if (inspection.hasMavenProject && !inspection.hasMavenWrapper) {
            requiresMavenOnPath = true;
          }
          if (inspection.hasGradleProject && !inspection.hasGradleWrapper) {
            requiresGradleOnPath = true;
          }
        }

        if (requiresMavenOnPath) {
          const mavenCheck = await this.withJavaCacheEnv(cwd, async () =>
            this.runCommand('mvn', ['-version'], cwd)
          );
          if (mavenCheck !== 0) {
            return {
              exitCode: mavenCheck,
              message:
                'Maven is required for one or more workspace Java projects without Maven Wrapper. Install Maven 3.9+, or add mvnw/mvnw.cmd to those projects.',
            };
          }
          const mavenVersion = await this.checkSystemMavenVersion(cwd);
          if (mavenVersion.exitCode !== 0) {
            return mavenVersion;
          }
        }

        if (requiresGradleOnPath) {
          const gradleCheck = await this.withJavaCacheEnv(cwd, async () =>
            this.runCommand('gradle', ['--version'], cwd)
          );
          if (gradleCheck !== 0) {
            return {
              exitCode: gradleCheck,
              message:
                'Gradle is required for one or more workspace Java projects without Gradle Wrapper. Install Gradle 8+, or add gradlew/gradlew.bat to those projects.',
            };
          }
        }

        return { exitCode: 0 };
      }
    }

    const mavenCheck = await this.withJavaCacheEnv(cwd, async () =>
      this.runCommand('mvn', ['-version'], cwd)
    );
    if (mavenCheck === 0) {
      const versionCheck = await this.checkSystemMavenVersion(cwd);
      if (versionCheck.exitCode !== 0) return versionCheck;
      return { exitCode: 0 };
    }

    const gradleCheck = await this.withJavaCacheEnv(cwd, async () =>
      this.runCommand('gradle', ['--version'], cwd)
    );
    if (gradleCheck === 0) {
      return { exitCode: 0 };
    }

    return {
      exitCode: mavenCheck || gradleCheck || 1,
      message:
        'Neither Maven nor Gradle is available on PATH. Install one of them, or use mvnw/gradlew wrappers in project roots.',
    };
  }

  async warmSetupCache(projectPath: string): Promise<CommandResult> {
    return this.withJavaCacheEnv(projectPath, async () => {
      try {
        const repoOpt = process.env.MAVEN_OPTS?.match(/-Dmaven\.repo\.local=([^\s]+)/)?.[1];
        if (repoOpt) {
          fs.mkdirSync(repoOpt, { recursive: true });
        }
        if (process.env.GRADLE_USER_HOME) {
          fs.mkdirSync(process.env.GRADLE_USER_HOME, { recursive: true });
        }
        return { exitCode: 0 };
      } catch {
        return { exitCode: 1, message: 'Failed to prepare Java cache directories' };
      }
    });
  }

  async initProject(projectPath: string): Promise<CommandResult> {
    return this.runBuildTool(
      projectPath,
      this.commandArgsFor(this.detectBuildTool(projectPath), 'init')
    );
  }

  async runDev(projectPath: string): Promise<CommandResult> {
    return this.runBuildTool(
      projectPath,
      this.commandArgsFor(this.detectBuildTool(projectPath), 'dev')
    );
  }

  async runTest(projectPath: string): Promise<CommandResult> {
    return this.runBuildTool(
      projectPath,
      this.commandArgsFor(this.detectBuildTool(projectPath), 'test')
    );
  }

  async runBuild(projectPath: string): Promise<CommandResult> {
    return this.runBuildTool(
      projectPath,
      this.commandArgsFor(this.detectBuildTool(projectPath), 'build')
    );
  }

  async runStart(projectPath: string): Promise<CommandResult> {
    const existingJar = this.resolveJarPath(projectPath);
    if (existingJar) {
      const exitCode = await this.runCommand(
        this.resolveJavaCommand(projectPath),
        ['-jar', existingJar],
        projectPath
      );
      return { exitCode };
    }

    const buildResult = await this.runBuild(projectPath);
    if (buildResult.exitCode !== 0) {
      return buildResult;
    }

    const builtJar = this.resolveJarPath(projectPath);
    if (!builtJar) {
      return {
        exitCode: 1,
        message:
          'Spring Boot build completed, but no runnable JAR was found under target/ or build/libs/. Verify build output naming and packaging plugins.',
      };
    }

    const exitCode = await this.runCommand(
      this.resolveJavaCommand(projectPath),
      ['-jar', builtJar],
      projectPath
    );
    return { exitCode };
  }

  async runLint(projectPath: string): Promise<CommandResult> {
    if (hasMakefileTarget(projectPath, 'lint')) {
      return { exitCode: await this.runCommand('make', ['lint'], projectPath) };
    }

    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath) && fs.readFileSync(pomPath, 'utf-8').includes('checkstyle')) {
      return this.runBuildTool(projectPath, ['checkstyle:check']);
    }

    return {
      exitCode: 1,
      message:
        'No Java lint tooling detected. Add a Makefile lint target or configure checkstyle in Maven/Gradle.',
    };
  }

  async runFormat(projectPath: string): Promise<CommandResult> {
    if (hasMakefileTarget(projectPath, 'format')) {
      return { exitCode: await this.runCommand('make', ['format'], projectPath) };
    }

    const gradleFiles = ['build.gradle', 'build.gradle.kts']
      .map((name) => path.join(projectPath, name))
      .filter((candidate) => fs.existsSync(candidate));
    if (gradleFiles.some((file) => fs.readFileSync(file, 'utf-8').includes('spotless'))) {
      return this.runBuildTool(projectPath, ['spotlessApply']);
    }

    return {
      exitCode: 1,
      message:
        'No Java format tooling detected. Add a Makefile format target or configure spotless in Gradle.',
    };
  }

  async doctorHints(_projectPath: string): Promise<string[]> {
    return [
      'Install JDK 21+ and Maven/Gradle (or commit mvnw/gradlew wrappers) for reliable local builds.',
      'Run rapidkit init after dependency changes to warm Java caches for your build tool.',
      'Use SPRING_PROFILES_ACTIVE to switch environments without changing source config.',
    ];
  }
}
