export const runtime = 'edge';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/app/', '/library/', '/collections/', '/pair/'],
    },
    sitemap: 'https://mindvault.ch/sitemap.xml',
  };
}
