// Improved .NET Bridge Manager with better error handling and performance

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { BridgeResponse, BridgeQueueItem } from '../types';
import { EXTENSION_CONSTANTS } from '../constants';

export class DotnetBridgeManager {
    private static outputChannel: vscode.OutputChannel | null = null;
    private process: ChildProcessWithoutNullStreams | null = null;
    private busy = false;
    private queue: BridgeQueueItem[] = [];
    private readonly projectPath: string;
    private restarting = false;
    private buffer = '';
    private currentResolve?: (value: any) => void;
    private currentReject?: (reason?: any) => void;
    private timeoutHandle?: NodeJS.Timeout;
    private disposed = false;

    constructor(private readonly extensionPath: string) {
        if (!DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel = vscode.window.createOutputChannel('LiteDB Bridge');
        }
        this.projectPath = path.join(extensionPath, 'backend', 'LiteDbBridge', 'LiteDbBridge.csproj');
        this.launch();
    }

    private launch(): void {
        if (this.disposed) {
            return;
        }

        this.cleanup();
        
        try {
            this.process = spawn(
                'dotnet', 
                ['run', '--project', this.projectPath, '--', '--persistent'], 
                {
                    cwd: this.extensionPath,
                    stdio: ['pipe', 'pipe', 'pipe']
                }
            );

            this.process.on('exit', (code) => this.handleExit(code));
            this.process.on('error', (err) => this.handleError(err));
            
            this.process.stdout.setEncoding('utf8');
            this.process.stderr.setEncoding('utf8');
            
            this.process.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
            this.process.stderr.on('data', (chunk: string) => this.handleStderr(chunk));
        } catch (error) {
            this.log(`Failed to launch bridge: ${error}`, true);
        }
    }

    private cleanup(): void {
        if (this.process) {
            this.process.removeAllListeners();
            if (!this.process.killed) {
                this.process.kill();
            }
            this.process = null;
        }

        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }

        this.buffer = '';
    }

    private handleExit(code: number | null): void {
        this.log(`Bridge process exited with code ${code}`);
        this.process = null;

        // Reject current pending request
        if (this.currentReject) {
            this.currentReject(new Error('Bridge process terminated unexpectedly'));
            this.currentResolve = undefined;
            this.currentReject = undefined;
        }

        if (!this.restarting && !this.disposed) {
            this.restarting = true;
            setTimeout(() => {
                if (!this.disposed) {
                    this.launch();
                }
                this.restarting = false;
            }, EXTENSION_CONSTANTS.BRIDGE_RESTART_DELAY);
        }
    }

    private handleError(error: Error): void {
        this.log(`Bridge process error: ${error.message}`, true);
    }

    private handleStdout(chunk: string): void {
        this.buffer += chunk;
        let idx: number;
        
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, idx).trim();
            this.buffer = this.buffer.slice(idx + 1);
            
            if (line && line !== '-' && line !== '--') {
                this.log(`Response: ${line}`);
                this.handleResponse(line);
            }
        }
    }

    private handleStderr(chunk: string): void {
        this.log(`STDERR: ${chunk}`, true);
    }

    private handleResponse(line: string): void {
        if (!this.currentResolve) {
            return;
        }

        // Clear timeout
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }

        try {
            const parsed = JSON.parse(line);
            this.currentResolve(parsed);
        } catch (error) {
            this.currentReject?.(new Error(`Failed to parse response: ${error}`));
        } finally {
            this.currentResolve = undefined;
            this.currentReject = undefined;
            this.busy = false;
            this.processQueue();
        }
    }

    public async send<T>(payload: unknown): Promise<BridgeResponse<T>> {
        if (this.disposed) {
            return { success: false, error: 'Bridge manager is disposed' };
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ 
                payload, 
                resolve, 
                reject,
                timestamp: Date.now()
            });
            this.processQueue();
        });
    }

    private processQueue(): void {
        if (this.busy || !this.process || this.queue.length === 0 || this.disposed) {
            return;
        }

        this.busy = true;
        const item = this.queue.shift()!;
        
        this.currentResolve = item.resolve;
        this.currentReject = item.reject;

        try {
            const payload = JSON.stringify(item.payload) + '\n';
            this.process.stdin.write(payload, (error) => {
                if (error) {
                    this.currentReject?.(error);
                    this.busy = false;
                    this.currentResolve = undefined;
                    this.currentReject = undefined;
                    this.processQueue();
                }
            });

            // Set timeout for response
            this.timeoutHandle = setTimeout(() => {
                if (this.currentReject) {
                    this.currentReject(new Error('Request timeout'));
                    this.currentResolve = undefined;
                    this.currentReject = undefined;
                    this.busy = false;
                    this.processQueue();
                }
            }, EXTENSION_CONSTANTS.BRIDGE_RESPONSE_TIMEOUT);
            
        } catch (error) {
            item.reject(error);
            this.busy = false;
            this.currentResolve = undefined;
            this.currentReject = undefined;
            this.processQueue();
        }
    }

    public dispose(): void {
        this.disposed = true;
        
        // Reject all pending requests
        for (const item of this.queue) {
            item.reject(new Error('Bridge manager disposed'));
        }
        this.queue = [];

        if (this.currentReject) {
            this.currentReject(new Error('Bridge manager disposed'));
            this.currentResolve = undefined;
            this.currentReject = undefined;
        }

        this.cleanup();

        if (DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel.dispose();
            DotnetBridgeManager.outputChannel = null;
        }
    }

    private log(message: string, isError = false): void {
        if (DotnetBridgeManager.outputChannel) {
            const prefix = isError ? '[Bridge ERROR]' : '[Bridge]';
            DotnetBridgeManager.outputChannel.appendLine(`${prefix} ${message}`);
        }
    }
}
