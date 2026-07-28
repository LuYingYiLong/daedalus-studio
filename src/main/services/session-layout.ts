import { app, ipcMain } from "electron";
import { join } from "node:path";
import {
	SessionLayoutStore,
	type SessionLayoutMap,
	type SessionLayoutPreferences
} from "./session-layout-store";

type SaveSessionLayoutPayload = {
	sessionId: string;
	layout: SessionLayoutPreferences;
};

type RemoveSessionLayoutsPayload = {
	sessionIds: string[];
};

class SessionLayoutService {
	private store: SessionLayoutStore | null = null;

	registerIpc(): void {
		ipcMain.handle("session-layout:get-all", async (): Promise<SessionLayoutMap> => {
			return await this.getStore().getAll();
		});
		ipcMain.handle(
			"session-layout:save",
			async (_event, payload: SaveSessionLayoutPayload): Promise<SessionLayoutPreferences> => {
				if (typeof payload !== "object" || payload === null) {
					throw new Error("Invalid session layout payload.");
				}
				return await this.getStore().save(payload.sessionId, payload.layout);
			}
		);
		ipcMain.handle(
			"session-layout:remove",
			async (_event, payload: RemoveSessionLayoutsPayload): Promise<{ removed: number }> => {
				if (typeof payload !== "object" || payload === null) {
					throw new Error("Invalid session layout payload.");
				}
				return await this.getStore().remove(payload.sessionIds);
			}
		);
	}

	private getStore(): SessionLayoutStore {
		if (this.store === null) {
			this.store = new SessionLayoutStore(join(app.getPath("userData"), "session-layouts.json"));
		}
		return this.store;
	}
}

export const sessionLayoutService = new SessionLayoutService();
