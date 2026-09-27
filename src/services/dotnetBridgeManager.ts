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
    private readonly dllPath: string;
    private restarting = false;
    private restartHandle?: NodeJS.Timeout;
    private buffer = '';
    private currentResolve?: (value: any) => void;
    private currentReject?: (reason?: any) => void;
    private timeoutHandle?: NodeJS.Timeout;
    private disposed = false;

    constructor(private readonly extensionPath: string) {
        if (!DotnetBridgeManager.outputChannel) {
            DotnetBridgeManager.outputChannel = vscode.window.createOutputChannel('LiteDB Bridge');
        }
    this.dllPath = path.join(extensionPath, 'out', 'LiteDbBridge', 'LiteDbBridge.dll');
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
                [this.dllPath, '--persistent'],
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

        this.clearTimeout();
        this.busy = false;
        this.buffer = '';

        if (!this.restarting && !this.disposed) {
            this.restarting = true;
            this.restartHandle = setTimeout(() => {
                if (!this.disposed) {
                    this.launch();
                    this.processQueue();
                }
                this.restarting = false;
            }, EXTENSION_CONSTANTS.BRIDGE_RESTART_DELAY);
        }
    }

    private handleError(error: Error): void {
        this.log(`Bridge process error: ${error.message}`, true);
        // A failed spawn may never produce a usable stdout stream.
        this.process?.kill();
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
        // Parse log level from C# backend messages
        const isError = chunk.includes('[ERROR]');
        this.log(`STDERR: ${chunk}`, isError);
    }

    private handleResponse(line: string): void {
        if (!this.currentResolve) {
            return;
        }

        // Clear timeout
        try {
            const parsed = JSON.parse(line);
            this.clearTimeout();
            this.currentResolve(parsed);
        } catch (error) {
            this.clearTimeout();
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
            const process = this.process;
            process.stdin.write(payload, (error) => {
                if (error) {
                    this.clearTimeout();
                    this.currentReject?.(error);
                    this.busy = false;
                    this.currentResolve = undefined;
                    this.currentReject = undefined;
                    process.kill();
                }
            });

            // Set timeout for response
            this.timeoutHandle = setTimeout(() => {
                if (this.currentReject) {
                    this.currentReject(new Error('Request timeout'));
                    this.currentResolve = undefined;
                    this.currentReject = undefined;
                    this.busy = false;
                    // The backend may still return the timed out response. Restart it
                    // before sending another request so replies cannot be misattributed.
                    process.kill();
                }
            }, EXTENSION_CONSTANTS.BRIDGE_RESPONSE_TIMEOUT);
            
        } catch (error) {
            this.clearTimeout();
            item.reject(error);
            this.busy = false;
            this.currentResolve = undefined;
            this.currentReject = undefined;
            this.processQueue();
        }
    }

    public async dispose(): Promise<void> {
        if (this.disposed) return;
        // Give the bridge a bounded chance to checkpoint before terminating it.
        if (this.process && !this.process.killed && !this.busy && this.queue.length === 0) {
            let timer: NodeJS.Timeout | undefined;
            try {
                await Promise.race([
                    this.send({ command: 'close', dbPath: '' }),
                    new Promise<void>(resolve => { timer = setTimeout(resolve, 2000); })
                ]);
            } catch (error) {
                this.log(`Error during graceful shutdown: ${error}`, true);
            } finally {
                if (timer) clearTimeout(timer);
            }
        }
        this.disposed = true;

        if (this.restartHandle) {
            clearTimeout(this.restartHandle);
        }
        
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

    private clearTimeout(): void {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }
    }

    private log(message: string, isError = false): void {
        if (DotnetBridgeManager.outputChannel) {
            const prefix = isError ? '[Bridge ERROR]' : '[Bridge]';
            DotnetBridgeManager.outputChannel.appendLine(`${prefix} ${message}`);
        }
    }
}
