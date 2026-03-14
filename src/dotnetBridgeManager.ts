import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export type BridgeResponse<T> = {
    success: boolean;
    error?: string;
    data?: T;
};

export class DotnetBridgeManager {
    /**
     * Opens a database file by sending an explicit command to the backend bridge.
     * Returns a promise with the backend's response.
     */
    public async openDatabase<T = any>(dbPath: string): Promise<BridgeResponse<T>> {
        return this.send<T>({ command: 'open', dbPath });
    }
    private static outputChannel: vscode.OutputChannel | null = null;
    private process: ChildProcessWithoutNullStreams | null = null;
    private busy = false;
    private queue: Array<{
        payload: unknown;
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
    }> = [];
    private extensionPath: string;
    private projectPath: string;
    private restarting = false;
    private buffer = '';
    private currentResolve?: (value: any) => void;
    private currentReject?: (reason?: any) => void;

    constructor(extensionPath: string) {
        if (!DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel = vscode.window.createOutputChannel('LiteDB Bridge');
        }
        this.extensionPath = extensionPath;
        this.projectPath = path.join(extensionPath, 'backend', 'LiteDbBridge', 'LiteDbBridge.csproj');
        this.launch();
    }

    private launch() {
        if (this.process) {
            this.process.removeAllListeners();
            this.process.kill();
        }
        this.process = spawn('dotnet', ['run', '--project', this.projectPath, '--', '--persistent'], {
            cwd: this.extensionPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.process.on('exit', () => this.handleExit());
        this.process.on('error', () => this.handleExit());
        this.process.stdout.setEncoding('utf8');
        this.process.stderr.setEncoding('utf8');
        this.process.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
        this.process.stderr.on('data', (chunk: string) => this.handleStderr(chunk));
    }

    private handleExit() {
        this.process = null;
        if (!this.restarting) {
            this.restarting = true;
            setTimeout(() => {
                this.launch();
                this.restarting = false;
            }, 500);
        }

    }

    private handleStdout(chunk: string) {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);
            // Log every line received from .NET bridge
            if (DotnetBridgeManager.outputChannel) {
                DotnetBridgeManager.outputChannel.appendLine(`[Bridge] ${line}`);
            }
            this.handleResponse(line);
        }
    }

    private handleStderr(chunk: string) {
        // Log stderr output to the output channel
        if (DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel.appendLine(`[Bridge STDERR] ${chunk}`);
        }
    }

    private handleResponse(line: string) {
        if (!this.currentResolve) return;
        // Ignore empty lines or lines that are just dashes or not valid JSON
        const trimmed = line.trim();
        if (!trimmed || trimmed === '-' || trimmed === '--') {
            // Ignore and do not reject, just move on
            this.currentResolve = undefined;
            this.currentReject = undefined;
            this.busy = false;
            this.processQueue();
            return;
        }
        try {
            const parsed = JSON.parse(line);
            // Show the result in the OutputChannel
            if (DotnetBridgeManager.outputChannel) {
                DotnetBridgeManager.outputChannel.appendLine('[Result] ' + JSON.stringify(parsed, null, 2));
            }
            this.currentResolve(parsed);
        } catch (e) {
            // Only reject if the line is not empty and not ignorable
            this.currentReject?.('Bridge parse error: ' + String(e) + ' | Line: ' + line);
        }
        this.currentResolve = undefined;
        this.currentReject = undefined;
        this.busy = false;
        this.processQueue();
    }

    public async send<T>(payload: unknown): Promise<BridgeResponse<T>> {
        return new Promise((resolve, reject) => {
            this.queue.push({ payload, resolve, reject });
            this.processQueue();
        });
    }

    private processQueue() {
        if (this.busy || !this.process || this.queue.length === 0) return;
        this.busy = true;
        const { payload, resolve, reject } = this.queue.shift()!;
        this.currentResolve = resolve;
        this.currentReject = reject;
        try {
            this.process.stdin.write(JSON.stringify(payload) + '\n');
        } catch (e) {
            reject(e);
            this.busy = false;
            this.processQueue();
        }
        setTimeout(() => {
            if (this.busy) {
                this.currentReject?.('Timeout waiting for bridge response');
                this.busy = false;
                this.processQueue();
            }
        }, 10000);
    }

    public dispose() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        if (DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel.dispose();
            DotnetBridgeManager.outputChannel = null;
        }
    }
}
