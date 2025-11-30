import { copyFile, readFile, writeFile } from "fs/promises";
import { spawn } from "bun";

export async function copyFileWithLog(src: string, dest: string): Promise<void> {
  try {
    await copyFile(src, dest);
    console.log(`Copied: ${src} → ${dest}`);
  } catch (error) {
    throw new Error(`Failed to copy ${src} to ${dest}: ${error}`);
  }
}

export async function replaceInFile(filePath: string, searchText: string, replaceText: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf-8");
    const updatedContent = content.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
    await writeFile(filePath, updatedContent, "utf-8");
    console.log(`Updated imports in: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to update file ${filePath}: ${error}`);
  }
}

export async function execCommand(command: string, args: string[] = [], cwd?: string): Promise<void> {
  const proc = spawn({
    cmd: [command, ...args],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')} (exit code: ${exitCode})`);
  }
}