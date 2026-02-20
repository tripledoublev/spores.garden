import { resolveHandle } from '../at-client';
import { escapeHtml } from './sanitize';

export type Facet = {
    $type: 'app.bsky.richtext.facet';
    index: { byteStart: number; byteEnd: number };
    features: Array<
        | { $type: 'app.bsky.richtext.facet#link'; uri: string }
        | { $type: 'app.bsky.richtext.facet#mention'; did: string }
        | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
    >;
};

export async function detectFacets(text: string): Promise<Facet[]> {
    const encoder = new TextEncoder();
    const facets: Facet[] = [];

    // --- URL facets ---
    const urlRanges: Array<{ start: number; end: number }> = [];
    const urlRegex = /https?:\/\/[^\s\)\]\}>"']+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
        const url = match[0];
        urlRanges.push({ start: match.index, end: match.index + url.length });
        const byteStart = encoder.encode(text.slice(0, match.index)).byteLength;
        const byteEnd = byteStart + encoder.encode(url).byteLength;
        facets.push({ $type: 'app.bsky.richtext.facet', index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
    }

    // --- Mention facets ---
    // Require at least one dot so bare @alice tokens are excluded
    const mentionRegex = /@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/g;
    const mentionPromises: Array<Promise<void>> = [];
    while ((match = mentionRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const handle = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + fullMatch.length;

        if (urlRanges.some(r => matchStart >= r.start && matchEnd <= r.end)) continue;

        const capturedStart = matchStart;
        const capturedFull = fullMatch;
        mentionPromises.push(
            resolveHandle(handle)
                .then(did => {
                    const byteStart = encoder.encode(text.slice(0, capturedStart)).byteLength;
                    const byteEnd = byteStart + encoder.encode(capturedFull).byteLength;
                    facets.push({ $type: 'app.bsky.richtext.facet', index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
                })
                .catch(() => {})
        );
    }
    await Promise.all(mentionPromises);

    // --- Tag/hashtag facets ---
    // tag field omits the leading #; byte range covers the # prefix
    const tagRegex = /#([^\s.,;:!?'"()\[\]{}&<>#]+)/g;
    while ((match = tagRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const tag = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + fullMatch.length;

        if (urlRanges.some(r => matchStart >= r.start && matchEnd <= r.end)) continue;

        const byteStart = encoder.encode(text.slice(0, matchStart)).byteLength;
        const byteEnd = byteStart + encoder.encode(fullMatch).byteLength;
        facets.push({ $type: 'app.bsky.richtext.facet', index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] });
    }

    facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
    return facets;
}

export function applyBskyFacets(plaintext: string, facets: Facet[]): string {
    if (!facets || facets.length === 0) return escapeHtml(plaintext);
    let result = '';
    let lastIndex = 0;
    const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);
    for (const facet of sorted) {
        const { byteStart, byteEnd } = facet.index;
        if (byteStart > lastIndex) result += escapeHtml(plaintext.slice(lastIndex, byteStart));
        let formattedText = escapeHtml(plaintext.slice(byteStart, byteEnd));
        for (const feature of facet.features) {
            if (feature.$type === 'app.bsky.richtext.facet#link') {
                const uri = String(feature.uri);
                if (uri.startsWith('https://') || uri.startsWith('http://')) {
                    formattedText = `<a href="${escapeHtml(uri)}" target="_blank" rel="noopener noreferrer">${formattedText}</a>`;
                }
            } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
                formattedText = `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${formattedText}</a>`;
            } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
                formattedText = `<a href="https://bsky.app/search?q=%23${encodeURIComponent(feature.tag)}" target="_blank" rel="noopener noreferrer">${formattedText}</a>`;
            }
        }
        result += formattedText;
        lastIndex = byteEnd;
    }
    if (lastIndex < plaintext.length) result += escapeHtml(plaintext.slice(lastIndex));
    return result || escapeHtml(plaintext);
}
