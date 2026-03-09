export const runtime = 'edge';

export const metadata = {
  title: 'Open Source Licenses — MindVault',
  description: 'Third-party open source software used in MindVault.',
};

export default function LicensesPage() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f5f2eb', color: '#1a1a18', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @font-face { font-family:'Harmony'; src:url('/fonts/Harmony.otf') format('opentype'); font-weight:400; font-display:swap; }
        @font-face { font-family:'Humane'; src:url('/fonts/Humane-Medium.ttf') format('truetype'); font-weight:500; font-display:swap; }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --bg:#f5f2eb; --surface:#faf8f4; --border:#e2e0d8;
          --text:#1a1a18; --text-muted:#888880; --text-dim:#bbbbb5;
          --accent:#C8861E;
        }
        .nav { display:flex; align-items:center; justify-content:space-between; padding:18px 48px; border-bottom:1px solid var(--border); background:rgba(245,242,235,0.92); backdrop-filter:blur(16px); position:sticky; top:0; z-index:100; }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); }
        .nav-logo img { width:28px; height:28px; border-radius:6px; display:block; }
        .nav-logo-text { font-family:'Humane',sans-serif; font-weight:500; font-size:22px; letter-spacing:0.04em; line-height:1; padding-top:2px; }
        .container { max-width:680px; margin:0 auto; padding:72px 24px 100px; }
        .container h1 { font-family:'Harmony',sans-serif; font-size:clamp(32px,4vw,48px); font-weight:400; letter-spacing:-0.5px; margin-bottom:8px; }
        .updated { font-size:13px; color:var(--text-dim); margin-bottom:56px; }
        .lib { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:24px 28px; margin-bottom:16px; }
        .lib-header { display:flex; align-items:baseline; gap:12px; margin-bottom:8px; }
        .lib-name { font-size:16px; font-weight:700; color:var(--text); }
        .lib-license { font-size:12px; font-weight:600; color:var(--accent); background:rgba(200,134,30,0.1); border:1px solid rgba(200,134,30,0.2); border-radius:20px; padding:2px 10px; letter-spacing:0.04em; }
        .lib-desc { font-size:14px; color:var(--text-muted); line-height:1.6; margin-bottom:10px; }
        .lib-link { font-size:13px; color:var(--accent); text-decoration:none; }
        .lib-link:hover { text-decoration:underline; }
        .intro { font-size:15px; color:var(--text-muted); line-height:1.75; margin-bottom:48px; }
        @media(max-width:600px){ .nav{padding:16px 20px;} .container{padding:48px 20px 80px;} }
      `}</style>

      <nav className="nav">
        <a href="/" className="nav-logo">
          <img src="/icon-512x512.png" alt="MindVault" />
          <span className="nav-logo-text">MindVault</span>
        </a>
      </nav>

      <div className="container">
        <h1>Open Source Licenses</h1>
        <p className="updated">MindVault is built with the help of the following open source projects.</p>

        <p className="intro">
          We are grateful to the open source community. Below are the third-party tools
          and libraries bundled with or used by MindVault, along with their respective licenses.
        </p>

        <div className="lib">
          <div className="lib-header">
            <span className="lib-name">ffmpeg</span>
            <span className="lib-license">GPL v2+</span>
          </div>
          <p className="lib-desc">
            A complete, cross-platform solution to record, convert and stream audio and video.
            Used by MindVault for video thumbnail extraction and GIF creation.
            The ffmpeg binary is distributed as a standalone executable and is not statically
            linked into MindVault's source code.
          </p>
          <a href="https://ffmpeg.org" target="_blank" rel="noopener" className="lib-link">
            ffmpeg.org — source code and full license text
          </a>
        </div>

        <div className="lib">
          <div className="lib-header">
            <span className="lib-name">yt-dlp</span>
            <span className="lib-license">The Unlicense</span>
          </div>
          <p className="lib-desc">
            A feature-rich command-line audio/video downloader.
            Used by MindVault to download media from supported platforms such as YouTube,
            Instagram and Vimeo.
          </p>
          <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener" className="lib-link">
            github.com/yt-dlp/yt-dlp
          </a>
        </div>

        <div className="lib">
          <div className="lib-header">
            <span className="lib-name">Electron</span>
            <span className="lib-license">MIT</span>
          </div>
          <p className="lib-desc">
            Build cross-platform desktop apps with JavaScript, HTML, and CSS.
          </p>
          <a href="https://www.electronjs.org" target="_blank" rel="noopener" className="lib-link">
            electronjs.org
          </a>
        </div>

        <div className="lib">
          <div className="lib-header">
            <span className="lib-name">Next.js</span>
            <span className="lib-license">MIT</span>
          </div>
          <p className="lib-desc">
            The React framework for the web. Used as MindVault's UI layer.
          </p>
          <a href="https://nextjs.org" target="_blank" rel="noopener" className="lib-link">
            nextjs.org
          </a>
        </div>

        <div className="lib">
          <div className="lib-header">
            <span className="lib-name">SQLite (better-sqlite3)</span>
            <span className="lib-license">MIT</span>
          </div>
          <p className="lib-desc">
            A fast and simple SQLite3 binding for Node.js. Used as MindVault's local database.
          </p>
          <a href="https://github.com/WiseLibs/better-sqlite3" target="_blank" rel="noopener" className="lib-link">
            github.com/WiseLibs/better-sqlite3
          </a>
        </div>

      </div>
    </div>
  );
}
