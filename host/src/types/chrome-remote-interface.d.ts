declare module 'chrome-remote-interface' {
    export interface ClientOptions {
        host?: string;
        port?: number;
        secure?: boolean;
        target?: string | ((targets: unknown[]) => unknown);
        protocol?: object;
        local?: boolean;
    }

    export interface Client {
        on(event: string, callback: (...args: unknown[]) => void): void;
        once(event: string, callback: (...args: unknown[]) => void): void;
        close(): Promise<void>;
        // Add common domains
        Page: {
            enable(): Promise<void>;
            navigate(params: { url: string }): Promise<void>;
            captureScreenshot(params: {
                format?: string;
            }): Promise<{ data: string }>;
        };
        DOM: {
            enable(): Promise<void>;
        };
        Runtime: {
            enable(): Promise<void>;
            evaluate(params: {
                expression: string;
            }): Promise<{ result: { value: unknown } }>;
        };
        Target: {
            createTarget(params: {
                url: string;
                newWindow?: boolean;
                background?: boolean;
            }): Promise<{ targetId: string }>;
            attachToTarget(params: {
                targetId: string;
                flatten?: boolean;
            }): Promise<void>;
            closeTarget(params: { targetId: string }): Promise<void>;
        };
    }

    function CDP(options?: ClientOptions): Promise<Client>;

    export default CDP;
}
