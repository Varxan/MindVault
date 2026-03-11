import LandingBetaContent from './components/LandingBetaContent';

export const runtime = 'edge';

export const metadata = {
  title: 'MindVault — Visual Reference Tool for Filmmakers & Directors',
  description: 'Turn endless scrolling into a curated visual library. Save references, mood boards and ideas from Instagram, YouTube and Vimeo. Built for film directors, DoPs and treatment designers. Mac app.',

  metadataBase: new URL('https://mindvault.ch'),
  alternates: {
    canonical: '/',
  },

  // ── Open Graph (Facebook, LinkedIn, iMessage previews) ──────────────────
  openGraph: {
    title: 'MindVault — Visual Reference Tool for Filmmakers',
    description: 'Save what inspires you. Turn endless scrolling into a curated visual library. References, mood boards and ideas, always at hand.',
    url: 'https://mindvault.ch',
    siteName: 'MindVault',
    images: [
      {
        url: '/og-image.png',   // 1200×630 — add this file to public/ when ready
        width: 1200,
        height: 630,
        alt: 'MindVault — Visual reference tool for filmmakers and directors',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // ── Twitter / X Card ────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'MindVault — Visual Reference Tool for Filmmakers',
    description: 'Save what inspires you. Turn endless scrolling into a curated visual library for your next project.',
    images: ['/og-image.png'],
  },

  // ── Search engine hints ──────────────────────────────────────────────────
  keywords: [
    'visual reference tool filmmakers',
    'mood board app mac',
    'inspiration board directors',
    'film reference library',
    'treatment designer tool',
    'director of photography app',
    'save instagram references mac',
    'creative reference organiser',
    'visual inspiration tool',
    'mood board software mac',
  ],

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

// ── JSON-LD Structured Data ────────────────────────────────────────────────
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MindVault',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'macOS',
  description: 'Visual reference tool for filmmakers, directors of photography and treatment designers. Save references from Instagram, YouTube and Vimeo into a curated visual library.',
  url: 'https://mindvault.ch',
  author: {
    '@type': 'Organization',
    name: 'MindVault',
    url: 'https://mindvault.ch',
  },
  offers: {
    '@type': 'Offer',
    price: '29',
    priceCurrency: 'USD',
    availability: 'https://schema.org/ComingSoon',
  },
  screenshot: 'https://mindvault.ch/og-image.png',
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingBetaContent />
    </>
  );
}
