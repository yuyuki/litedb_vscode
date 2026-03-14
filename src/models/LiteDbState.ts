export class LiteDbState {
    private _dbPath: string | undefined;

    public get dbPath(): string | undefined {
        return this._dbPath;
    }

    public open(dbPath: string): void {
        this._dbPath = dbPath;
    }

    public close(): void {
        this._dbPath = undefined;
    }

    public isOpen(): boolean {
        return !!this._dbPath;
    }
}
