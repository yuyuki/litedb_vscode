import * as vscode from 'vscode';

export class CollectionItem extends vscode.TreeItem {
    constructor(public readonly name: string) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'litedbCollection';
        this.iconPath = new vscode.ThemeIcon('table');
        this.description = 'collection';
        this.command = {
            command: 'litedb.openCollection',
            title: 'Open Collection',
            arguments: [this]
        };
    }
}
