# NSID Lexicon Publishing

Instructions for publishing `coop.hypha.spores.*` lexicons and configuring DNS authority.

## 1. Publish Lexicons to Authoritative Repo

Dry run:
```bash
npm run publish-lexicons:repo -- --dry-run
```

Publish:
```bash
npm run publish-lexicons:repo
```

Required env:
- `ATPROTO_IDENTIFIER`
- `ATPROTO_APP_PASSWORD`

Optional env:
- `LEXICON_REPO_DID` (defaults to authenticated account DID)
- `ATPROTO_PDS_URL` (skip DID document lookup)

## 2. Configure DNS TXT Records

Add a `_lexicon` TXT record for each NSID authority group:

```
_lexicon.site.spores.hypha.coop    TXT "did=<authoritative-did>"
_lexicon.content.spores.hypha.coop TXT "did=<authoritative-did>"
_lexicon.social.spores.hypha.coop  TXT "did=<authoritative-did>"
_lexicon.item.spores.hypha.coop    TXT "did=<authoritative-did>"
```

## 3. Verify

- DNS TXT records resolve publicly (`dig TXT _lexicon.site.spores.hypha.coop`)
- Lexicon records are fetchable by NSID from the mapped DID repo
