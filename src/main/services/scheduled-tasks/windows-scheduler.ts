import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TASK_NAME: string = "Daedalus Studio Scheduled Tasks";

function xmlEscape(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function toLocalBoundary(value: Date): string {
	const part = (number: number): string => String(number).padStart(2, "0");
	return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}:${part(value.getSeconds())}`;
}

export function createWindowsTaskXml(executablePath: string, runAt: Date): string {
	const account = [process.env.USERDOMAIN, process.env.USERNAME].filter((part): part is string => typeof part === "string" && part.length > 0).join("\\");
	return `<?xml version="1.0" encoding="UTF-16"?>\n<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>Runs due Daedalus Studio scheduled tasks.</Description></RegistrationInfo><Triggers><TimeTrigger><StartBoundary>${toLocalBoundary(runAt)}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers><Principals><Principal id="Author">${account.length > 0 ? `<UserId>${xmlEscape(account)}</UserId>` : ""}<LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><AllowHardTerminate>true</AllowHardTerminate><ExecutionTimeLimit>PT2H</ExecutionTimeLimit><Enabled>true</Enabled></Settings><Actions Context="Author"><Exec><Command>${xmlEscape(executablePath)}</Command><Arguments>--scheduled-task-runner</Arguments></Exec></Actions></Task>`;
}

export class WindowsSchedulerAdapter {
	async synchronize(executablePath: string, nextRunAt: string | null): Promise<void> {
		if (process.platform !== "win32") return;
		if (nextRunAt === null) { await this.remove(); return; }
		const directory = await mkdtemp(join(tmpdir(), "daedalus-scheduler-"));
		const xmlPath = join(directory, "task.xml");
		try {
			await writeFile(xmlPath, `\uFEFF${createWindowsTaskXml(executablePath, new Date(nextRunAt))}`, "utf16le");
			await execFileAsync("schtasks.exe", ["/Create", "/TN", TASK_NAME, "/XML", xmlPath, "/F"], { windowsHide: true, timeout: 30_000 });
		} finally { await rm(directory, { recursive: true, force: true }); }
	}

	async remove(): Promise<void> {
		if (process.platform !== "win32") return;
		try { await execFileAsync("schtasks.exe", ["/Delete", "/TN", TASK_NAME, "/F"], { windowsHide: true, timeout: 30_000 }); } catch { /* Missing task is already synchronized. */ }
	}
}
