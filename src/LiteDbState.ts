export class LiteDbState {
    private _dbPath: string | undefined;
    private _childProcesses: Set<import('child_process').ChildProcess> = new Set();

    public get dbPath(): string | undefined {
        return this._dbPath;
    }

    public open(dbPath: string): void {
        this._dbPath = dbPath;
    }

    public addChildProcess(child: import('child_process').ChildProcess) {
        this._childProcesses.add(child);
        child.on('exit', () => this._childProcesses.delete(child));
        child.on('close', () => this._childProcesses.delete(child));
    }

    public close(): void {
        this._dbPath = undefined;
        this.cleanupChildProcesses();
    }

    public cleanupChildProcesses(): void {
        for (const child of this._childProcesses) {
            if (!child.killed) {
                try { child.kill(); } catch {}
            }
        }
        this._childProcesses.clear();
    }

    public isOpen(): boolean {
        return !!this._dbPath;
    }
}
