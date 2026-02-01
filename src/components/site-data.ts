import { describeRepo, listRecords, getRecord, getProfile } from '../at-client';
import { getCurrentDid, logout, getAgent, deleteRecord } from '../oauth';
import { showConfirmModal } from '../utils/confirm-modal';

/**
 * Handles data fetching and manipulation, specifically garden data resets and profile fetching.
 */
export class SiteData {
    private showNotification: (msg: string, type?: 'success' | 'error') => void;

    constructor(showNotification: (msg: string, type?: 'success' | 'error') => void) {
        this.showNotification = showNotification;
    }

    async resetGardenData() {
        const confirmReset = await showConfirmModal({
            title: 'Reset Garden Data',
            message: 'This will delete all your garden data and log you out. Are you sure?',
            confirmText: 'Delete All',
            cancelText: 'Cancel',
            confirmDanger: true,
        });
        if (!confirmReset) return;

        const currentDid = getCurrentDid();
        if (!currentDid) {
            this.showNotification('Could not determine your DID.', 'error');
            return;
        }

        this.showNotification('Deleting garden data...', 'success');

        let deletedLocalStorage = 0;
        let deletedPdsRecords = 0;
        const errors: string[] = [];

        try {
            // 1. Delete localStorage records
            const keysToDelete: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('spores.garden.')) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => localStorage.removeItem(key));
            deletedLocalStorage = keysToDelete.length;

            // 2. Delete PDS records - dynamically discover all garden.spores.* collections
            let gardenCollections: string[] = [];
            try {
                const repoInfo = await describeRepo(currentDid, getAgent());
                // Filter collections to only include garden.spores.* ones
                gardenCollections = (repoInfo.collections || []).filter((col: string) => col.startsWith('garden.spores.'));
                console.log(`Found ${gardenCollections.length} garden.spores.* collections:`, gardenCollections);
            } catch (error) {
                console.error('Failed to describe repo, using fallback collection list:', error);
                // Fallback to known collections if describeRepo fails
                gardenCollections = [
                    'garden.spores.config',
                    'garden.spores.site.config',
                    'garden.spores.site.sections',
                    'garden.spores.social.flower',
                    'garden.spores.social.takenFlower',
                    'garden.spores.content.block',
                    'garden.spores.content.image'
                ];
            }

            // For each collection, list and delete all records
            for (const collection of gardenCollections) {
                try {
                    console.log(`Checking collection: ${collection}`);
                    const response = await listRecords(currentDid, collection, { limit: 100 }, getAgent());
                    console.log(`Response for ${collection}:`, response);
                    const records = response?.records || [];
                    console.log(`Found ${records.length} records in ${collection}`);

                    for (const record of records) {
                        try {
                            // Extract rkey from the URI (format: at://did/collection/rkey)
                            const uriParts = record.uri.split('/');
                            const rkey = uriParts[uriParts.length - 1];

                            console.log(`Deleting ${collection}/${rkey}`);
                            await deleteRecord(collection, rkey);
                            deletedPdsRecords++;
                        } catch (error) {
                            console.error(`Failed to delete record ${record.uri}:`, error);
                            errors.push(`${collection}/${record.uri.split('/').pop()}`);
                        }
                    }
                } catch (error) {
                    // Collection might not exist, which is fine
                    console.log(`Error checking ${collection}:`, error);
                }
            }

            // Show summary
            let message = `Deleted ${deletedLocalStorage} localStorage records and ${deletedPdsRecords} PDS records.`;
            if (errors.length > 0) {
                message += ` Failed to delete ${errors.length} records.`;
            }
            message += ' Logging out...';

            this.showNotification(message, errors.length > 0 ? 'error' : 'success');

            // Logout and redirect to root after a short delay
            setTimeout(() => {
                logout();
                location.href = '/';
            }, 2000);
        } catch (error) {
            console.error('Failed to reset garden data:', error);
            this.showNotification(`Failed to reset: ${error.message}`, 'error');
        }
    }

    /**
     * Get display name for a DID
     * Prefer Bluesky profile (most users have it); optionally use garden.spores.site.profile for custom name
     */
    async getDisplayNameForDid(did: string): Promise<string | null> {
        try {
            const bskyProfile = await getProfile(did).catch(() => null);
            if (bskyProfile?.displayName) {
                return bskyProfile.displayName;
            }

            const customProfile = await getRecord(did, 'garden.spores.site.profile', 'self');
            if (customProfile?.value?.displayName) {
                return customProfile.value.displayName;
            }

            if (bskyProfile?.handle) {
                return bskyProfile.handle;
            }

            return null;
        } catch {
            return null;
        }
    }
}
