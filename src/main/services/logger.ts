export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3
}

type LogEntry = {
	level: LogLevel;
	timestamp: string;
	category: string;
	message: string;
	context?: Record<string, unknown>;
	error?: Error;
};

type LogTransport = (entry: LogEntry) => void;

class Logger {
	public level: LogLevel = LogLevel.INFO;
	public transports: Set<LogTransport> = new Set();
	private readonly category: string;

	constructor(category: string) {
		this.category = category;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	addTransport(transport: LogTransport): () => void {
		this.transports.add(transport);
		return (): void => {
			this.transports.delete(transport);
		};
	}

	private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
		if (level < this.level) {
			return;
		}

		const entry: LogEntry = {
			level,
			timestamp: new Date().toISOString(),
			category: this.category,
			message,
			context,
			error
		};

		for (const transport of this.transports) {
			try {
				transport(entry);
			} catch (e) {
				console.error("[Logger] Transport error", e);
			}
		}
	}

	debug(message: string, context?: Record<string, unknown>): void {
		this.log(LogLevel.DEBUG, message, context);
	}

	info(message: string, context?: Record<string, unknown>): void {
		this.log(LogLevel.INFO, message, context);
	}

	warn(message: string, context?: Record<string, unknown>, error?: Error): void {
		this.log(LogLevel.WARN, message, context, error);
	}

	error(message: string, error?: Error, context?: Record<string, unknown>): void {
		this.log(LogLevel.ERROR, message, context, error);
	}
}

class ConsoleTransport {
	private readonly levelColors: Map<LogLevel, string> = new Map([
		[LogLevel.DEBUG, "\x1b[36m"],
		[LogLevel.INFO, "\x1b[32m"],
		[LogLevel.WARN, "\x1b[33m"],
		[LogLevel.ERROR, "\x1b[31m"]
	]);

	private readonly levelNames: Map<LogLevel, string> = new Map([
		[LogLevel.DEBUG, "DEBUG"],
		[LogLevel.INFO, "INFO"],
		[LogLevel.WARN, "WARN"],
		[LogLevel.ERROR, "ERROR"]
	]);

	transport(entry: LogEntry): void {
		const color = this.levelColors.get(entry.level) ?? "";
		const reset = "\x1b[0m";
		const levelName = this.levelNames.get(entry.level) ?? "UNKNOWN";

		const prefix = `${color}[${levelName}]${reset} [${entry.category}]`;

		if (entry.error) {
			console.error(prefix, entry.message);
			console.error(entry.error);
		} else {
			console.log(prefix, entry.message, entry.context ?? "");
		}
	}
}

const globalLogger = new Logger("root");

function createLogger(category: string): Logger {
	const logger = new Logger(category);

	if (globalLogger.transports.size === 0) {
		const consoleTransport = new ConsoleTransport();
		logger.addTransport((entry: LogEntry): void => consoleTransport.transport(entry));
	}

	logger.setLevel(globalLogger.level);

	return logger;
}

function setGlobalLevel(level: LogLevel): void {
	globalLogger.setLevel(level);
}

export { createLogger, setGlobalLevel, type LogEntry, type LogTransport };
