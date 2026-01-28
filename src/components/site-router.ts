/**
 * Handles routing and navigation logic for the site.
 */
export class SiteRouter {
    /**
     * Navigates to a garden based on user input (DID or handle).
     */
    static navigateToGardenIdentifier(rawInput: string) {
        const input = rawInput.trim();
        if (!input) return;

        const withoutAt = input.startsWith('@') ? input.slice(1) : input;

        // DID form: did:plc:...
        if (withoutAt.startsWith('did:')) {
            location.href = `/?did=${encodeURIComponent(withoutAt)}`;
            return;
        }

        // Handle form: example.bsky.social or just handle
        location.href = `/?handle=${encodeURIComponent(withoutAt)}`;
    }

    /**
     * Checks if the current view is a profile/garden page.
     */
    static isViewingProfile(): boolean {
        const params = new URLSearchParams(location.search);
        return params.has('did') || params.has('handle') || location.pathname.length > 1;
    }

    /**
     * Gets the target DID from the URL if present.
     * Note: This is a synchronous check of URL params, not a resolved DID.
     */
    static getUrlDid(): string | null {
        const params = new URLSearchParams(location.search);
        return params.get('did');
    }

    /**
     * Gets the target handle from the URL if present.
     */
    static getUrlHandle(): string | null {
        const params = new URLSearchParams(location.search);
        return params.get('handle');
    }
}
