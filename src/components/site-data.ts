import { describeRepo, listRecords, getRecord, getProfile } from '../at-client';
import { getCurrentDid, logout, getAgent, deleteRecord, putRecord } from '../oauth';
import { NEW_NSID_PREFIX, OLD_NSID_PREFIX, SPORE_COLLECTION_KEYS, getCollection } from '../config/nsid';
import { showConfirmModal } from '../utils/confirm-modal';
import { debugLog } from '../utils/logger';

/**
 * Handles data fetching and manipulation, specifically garden data resets and profile fetching.
 */
export class SiteData {
    private showNotification: (msg: string, type?: 'success' | 'error') => void;
    private readonly maxPages = 200;

    constructor(showNotification: (msg: string, type?: 'success' | 'error') => void) {
        this.showNotification = showNotification;
    }

    private async getGardenCollections(currentDid: string): Promise<string[]> {
        try {
            const repoInfo = await describeRepo(currentDid, getAgent());
            const discovered = (repoInfo.collections || []).filter((col: string) =>
                col.startsWith(`${OLD_NSID_PREFIX}.`) || col.startsWith(`${NEW_NSID_PREFIX}.`)
            );
            if (discovered.length > 0) {
                return discovered;
            }
        } catch (error) {
            console.error('Failed to describe repo, using fallback collection list:', error);
        }

        return Array.from(new Set([
            ...SPORE_COLLECTION_KEYS.map((key) => getCollection(key, 'old')),
            ...SPORE_COLLECTION_KEYS.map((key) => getCollection(key, 'new')),
            'garden.spores.site.sections',
        ]));
    }

    private async listAllRecordsForCollection(currentDid: string, collection: string): Promise<any[]> {
        const all: any[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | undefined = undefined;

        for (let page = 0; page < this.maxPages; page++) {
            const response = await listRecords(currentDid, collection, { limit: 100, cursor }, getAgent());
            const records = response?.records || [];
            all.push(...records);

            const nextCursor = response?.cursor;
            if (!nextCursor) break;
            if (nextCursor === cursor || seenCursors.has(nextCursor)) break;
            seenCursors.add(nextCursor);
            cursor = nextCursor;
        }

        return all;
    }

    private containsBlobRef(value: unknown): boolean {
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) return value.some((item) => this.containsBlobRef(item));

        const obj = value as Record<string, unknown>;
        if (obj.$type === 'blob') return true;
        const hasBlobShape =
            (typeof obj.mimeType === 'string' || typeof obj.size === 'number')
            && !!obj.ref
            && typeof obj.ref === 'object'
            && obj.ref !== null
            && '$link' in (obj.ref as Record<string, unknown>);
        if (hasBlobShape) {
            return true;
        }

        return Object.values(obj).some((entry) => this.containsBlobRef(entry));
    }

    async backupGardenData() {
        const currentDid = getCurrentDid();
        if (!currentDid) {
            this.showNotification('Could not determine your DID.', 'error');
            return;
        }

        this.showNotification('Preparing garden backup...', 'success');

        try {
            const gardenCollections = await this.getGardenCollections(currentDid);
            const backupCollections: Record<string, any[]> = {};
            let totalRecords = 0;

            for (const collection of gardenCollections) {
                const records = await this.listAllRecordsForCollection(currentDid, collection);
                backupCollections[collection] = records;
                totalRecords += records.length;
            }

            const backup = {
                version: 1,
                generatedAt: new Date().toISOString(),
                repoDid: currentDid,
                collections: backupCollections,
                totalRecords,
            };

            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const safeDid = currentDid.replace(/[^a-zA-Z0-9:_-]/g, '_');
            const filename = `spores-garden-backup-${safeDid}-${ts}.json`;
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            this.showNotification(`Backup downloaded (${totalRecords} records).`, 'success');
        } catch (error: any) {
            console.error('Failed to back up garden data:', error);
            this.showNotification(`Backup failed: ${error?.message || 'unknown error'}`, 'error');
        }
    }

    async restoreGardenDataFromFile() {
        const currentDid = getCurrentDid();
        if (!currentDid) {
            this.showNotification('Could not determine your DID.', 'error');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';

        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const backup = JSON.parse(text);
                const collections = backup?.collections;
                if (!collections || typeof collections !== 'object') {
                    throw new Error('Invalid backup format.');
                }

                const totalRecords = Object.values(collections)
                    .filter((arr: any) => Array.isArray(arr))
                    .reduce((sum: number, arr: any) => sum + arr.length, 0);

                const confirmRestore = await showConfirmModal({
                    title: 'Restore Garden Data',
                    message: `This will upsert ${totalRecords} records into your repo. Continue?`,
                    confirmText: 'Restore',
                    cancelText: 'Cancel',
                    confirmDanger: false,
                });
                if (!confirmRestore) return;

                this.showNotification('Restoring garden data...', 'success');
                let written = 0;
                let skipped = 0;
                const skippedBlobRecords: string[] = [];
                const failedRecords: string[] = [];

                for (const [collection, records] of Object.entries(collections)) {
                    if (!Array.isArray(records)) continue;
                    for (const record of records as any[]) {
                        const uri = String(record?.uri || '');
                        const rkey = uri.split('/').pop();
                        const value = record?.value;
                        if (!rkey || !value || typeof value !== 'object') continue;
                        if (this.containsBlobRef(value)) {
                            skipped += 1;
                            skippedBlobRecords.push(`${collection}/${rkey}`);
                            continue;
                        }
                        try {
                            await putRecord(collection, rkey, value);
                            written += 1;
                        } catch (error: any) {
                            const msg = String(error?.message || error || '');
                            const recordId = `${collection}/${rkey}`;
                            if (msg.includes('Could not find blob')) {
                                skipped += 1;
                                skippedBlobRecords.push(recordId);
                                continue;
                            }
                            failedRecords.push(`${recordId}: ${msg}`);
                        }
                    }
                }

                if (failedRecords.length > 0) {
                    throw new Error(`Restore failed on ${failedRecords.length} record(s). First error: ${failedRecords[0]}`);
                }

                if (skipped > 0) {
                    console.warn('Restore skipped records with missing blobs:', skippedBlobRecords);
                    this.showNotification(`Restore complete (${written} records). Skipped ${skipped} record(s) with missing blobs.`, 'error');
                } else {
                    this.showNotification(`Restore complete (${written} records). Refreshing...`, 'success');
                }
                setTimeout(() => location.reload(), 800);
            } catch (error: any) {
                console.error('Failed to restore garden data:', error);
                this.showNotification(`Restore failed: ${error?.message || 'unknown error'}`, 'error');
            }
        });

        input.click();
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

            // 2. Delete PDS records - dynamically discover both old/new spores collections
            const gardenCollections = await this.getGardenCollections(currentDid);
            debugLog(`Found ${gardenCollections.length} spores collections:`, gardenCollections);

            // For each collection, list and delete all records
            for (const collection of gardenCollections) {
                try {
                    debugLog(`Checking collection: ${collection}`);
                    const records = await this.listAllRecordsForCollection(currentDid, collection);
                    debugLog(`Found ${records.length} records in ${collection}`);

                    for (const record of records) {
                        try {
                            // Extract rkey from the URI (format: at://did/collection/rkey)
                            const uriParts = record.uri.split('/');
                            const rkey = uriParts[uriParts.length - 1];

                            debugLog(`Deleting ${collection}/${rkey}`);
                            await deleteRecord(collection, rkey);
                            deletedPdsRecords++;
                        } catch (error) {
                            console.error(`Failed to delete record ${record.uri}:`, error);
                            errors.push(`${collection}/${record.uri.split('/').pop()}`);
                        }
                    }
                } catch (error) {
                    // Collection might not exist, which is fine
                    debugLog(`Error checking ${collection}:`, error);
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

            const customProfile =
              await getRecord(did, getCollection('siteProfile', 'new'), 'self')
              || await getRecord(did, getCollection('siteProfile', 'old'), 'self');
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
