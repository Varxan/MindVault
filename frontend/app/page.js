import LandingBetaContent from './components/LandingBetaContent';

export const runtime = 'edge';

export const metadata = {
  title: 'MindVault — Early Access',
  description: 'Turn endless scrolling into a curated visual library. References, mood boards and ideas, always at hand. Built for filmmakers, directors and creators.',
};

export default function Page() {
  return <LandingBetaContent />;
}
