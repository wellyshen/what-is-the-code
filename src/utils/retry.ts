/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: (error: Error) => {
        const message = error.message.toLowerCase();
        // Retry on transient errors
        return (
            message.includes('timeout') ||
            message.includes('rate limit') ||
            message.includes('econnreset') ||
            message.includes('enotfound') ||
            message.includes('socket hang up') ||
            message.includes('overloaded') ||
            message.includes('503') ||
            message.includes('529')
        );
    },
    onRetry: () => {}
};

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...defaultOptions, ...options };
    let lastError: Error = new Error('Unknown error');
    let delay = opts.initialDelayMs;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            const isLastAttempt = attempt === opts.maxAttempts;
            const isRetryable = opts.retryableErrors(lastError);

            if (isLastAttempt || !isRetryable) {
                throw lastError;
            }

            opts.onRetry(lastError, attempt);
            
            // Wait with exponential backoff
            await sleep(delay);
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }

    throw lastError;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout wrapper for promises
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage = 'Operation timed out'
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);

        promise
            .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });
}
