export type AppDialogOptions = {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    placeholder?: string;
    initialValue?: string;
};

export type AppDialogRequest =
    | ({ kind: 'alert'; message: string } & AppDialogOptions)
    | ({ kind: 'confirm'; message: string } & AppDialogOptions)
    | ({ kind: 'prompt'; message: string } & AppDialogOptions);

type AppDialogResult = boolean | string | null | undefined;
type AppDialogHandler = (request: AppDialogRequest) => Promise<AppDialogResult>;

let dialogHandler: AppDialogHandler | null = null;

export function registerAppDialogHandler(handler: AppDialogHandler): () => void {
    dialogHandler = handler;
    return () => {
        if (dialogHandler === handler) dialogHandler = null;
    };
}

function openDialog(request: AppDialogRequest): Promise<AppDialogResult> {
    if (!dialogHandler) {
        console.error('App dialog provider is not available.', request);
        return Promise.resolve(request.kind === 'confirm' ? false : null);
    }
    return dialogHandler(request);
}

export async function appAlert(message: string, options: AppDialogOptions = {}): Promise<void> {
    await openDialog({ kind: 'alert', message, ...options });
}

export async function appConfirm(message: string, options: AppDialogOptions = {}): Promise<boolean> {
    return (await openDialog({ kind: 'confirm', message, ...options })) === true;
}

export async function appPrompt(message: string, options: AppDialogOptions = {}): Promise<string | null> {
    const result = await openDialog({ kind: 'prompt', message, ...options });
    return typeof result === 'string' ? result : null;
}
