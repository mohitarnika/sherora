# Sherora Flowers

An opening-announcement site for Sherora Flowers in Gwalior, Madhya Pradesh. It presents Sher Singh Rajawat as founder and owner, with the website opening first and the physical Gwalior shop coming soon.

## Run locally

```bash
npm test
npm run serve
```

Then open `http://localhost:8123`.

## Deploy to Cloudflare Pages

1. In Cloudflare, open **Workers & Pages** and create a Pages project named `sherora-flowers-gwalior`.
2. Connect this GitHub repository, or deploy directly with:

```bash
npx wrangler pages deploy . --project-name sherora-flowers-gwalior --branch main
```

The project is static: no server, database, credentials, or environment files are required. `_headers` supplies the security and asset-cache headers.

## Included media

The two gallery images are local copies of the two supplied public Instagram-post images. Each image links to `https://www.instagram.com/_devu_rajawat/`.
