import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "hn02-hello-world-extension" is now active!');

    // Register the Hello World command
    const commandId = 'hn02-hello-world-extension.helloWorld';
    const disposable = vscode.commands.registerCommand(commandId, () => {
        vscode.window.showInformationMessage('Hello World from hn02-hello-world-extension!');
    });
    context.subscriptions.push(disposable);

    // Register a TreeDataProvider for the sidebar view
    const helloWorldProvider = new HelloWorldViewProvider();
    vscode.window.registerTreeDataProvider('helloWorldView', helloWorldProvider);

    console.log('Activity Bar icon and view initialized');
}

class HelloWorldViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // Root level items in the sidebar view
            return Promise.resolve([
                (() => {
                    const item = new vscode.TreeItem('Say Hello World', vscode.TreeItemCollapsibleState.None);
                    item.command = {
                        command: 'hn02-hello-world-extension.helloWorld',
                        title: 'Say Hello World'
                    };
                    return item;
                })()
            ]);
        }
        return Promise.resolve([]);
    }

    // Event emitter for refreshing the view
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export function deactivate() {}