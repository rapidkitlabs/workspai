export type RuntimeName = 'python' | 'node' | 'go' | 'java' | 'dotnet';

export type CommandResult = {
  exitCode: number;
  message?: string;
};

export interface RuntimeAdapter {
  readonly runtime: RuntimeName;
  checkPrereqs(): Promise<CommandResult>;
  warmSetupCache?(projectPath: string): Promise<CommandResult>;
  initProject(projectPath: string): Promise<CommandResult>;
  runDev(projectPath: string): Promise<CommandResult>;
  runTest(projectPath: string): Promise<CommandResult>;
  runBuild(projectPath: string): Promise<CommandResult>;
  runStart(projectPath: string): Promise<CommandResult>;
  doctorHints(projectPath: string): Promise<string[]>;
}
