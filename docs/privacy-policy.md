# Privacy Policy

**Effective Date:** March 2026
**Product:** MindVault
**Developer:** Varxan (sole developer, independent)

---

## 1. Overview

MindVault is a **local-first application**. This Privacy Policy explains what data is processed when you use MindVault, where it is stored, and how it is used.

The short version: **your data stays on your device**. MindVault does not operate a cloud backend, does not collect analytics, and does not sell or share your personal data with third parties.

---

## 2. Data You Create in the App

All content you save in MindVault — including links, titles, tags, notes, thumbnails, and collection names — is stored in a local SQLite database on your device.

**Location:**
- macOS: `~/Library/Application Support/MindVault/data/`
- Windows: `%APPDATA%\MindVault\data\`

This data never leaves your device unless you explicitly export it. Varxan has no access to this data.

---

## 3. Network Requests Made by the App

MindVault makes the following outbound network requests:

### 3.1 Fetching Link Metadata
When you save a link, MindVault contacts the URL you provided to retrieve metadata (title, description, thumbnail image). This is a direct request from your device to the third-party website — no intermediary server is involved. The third-party website may log your IP address as part of normal web server operation.

### 3.2 Media Download (yt-dlp / ffmpeg)
When saving video links, MindVault may use yt-dlp to download preview thumbnails or short clips for local reference. These requests go directly from your device to the relevant platform. MindVault does not proxy or log these requests.

### 3.3 Update Checker
Once on startup, the App queries the GitHub Releases API to check whether a newer version is available:

```
GET https://api.github.com/repos/Varxan/MindVault-releases/releases?per_page=1
```

This request includes a standard `User-Agent` header containing the app name and version number (e.g., `MindVault/1.0.0`). No personal data, no device identifiers, and no usage data are included. GitHub's privacy policy applies to this request: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement

### 3.4 License Activation
If you activate a license key, the key is verified against Varxan's licensing server. Only the license key itself is transmitted — no personal data, usage data, or device fingerprints are sent.

---

## 4. AI Features and Local Processing

MindVault includes AI-powered features including automatic tagging, semantic search, and visual similarity analysis using CLIP and language models.

**All AI processing runs entirely on your device.** No images, video frames, text, or metadata are sent to any external AI service (including OpenAI, Anthropic, Google, or any other provider). The AI models are bundled with the application.

---

## 5. Data We Do Not Collect

Varxan does not collect:

- Usage analytics or telemetry
- Crash reports (unless you manually send them)
- Search queries or browsing behavior within the app
- Device identifiers or fingerprints
- Location data
- Any personal information beyond what you explicitly provide

---

## 6. Third-Party Websites

When you save a link from a third-party website, you interact with that website's own infrastructure. MindVault is not responsible for the privacy practices of third-party websites or platforms. Please review the privacy policies of platforms whose content you access through the App.

---

## 7. Data Security

Your data is stored locally on your device and protected by your operating system's file permissions and security model. Varxan recommends enabling full-disk encryption on your device (FileVault on macOS, BitLocker on Windows) for additional protection.

Since Varxan does not store your data on any server, we cannot recover your data in the event of device loss or damage. **We recommend regular backups of your MindVault data folder.**

---

## 8. Your Rights

Since all your data is stored locally on your own device, you have full control over it at all times:

- **Access:** Your data is in a local SQLite database you can open directly
- **Export:** Use the built-in export function to export your data as JSON
- **Deletion:** Uninstalling the App and deleting the data folder removes all your data completely. No server-side deletion request is needed because no server-side data exists.

---

## 9. Children's Privacy

MindVault is not directed at children under the age of 13. We do not knowingly collect any information from children under 13.

---

## 10. Changes to This Policy

If this Privacy Policy changes materially, we will notify you via an in-app notice. Continued use of the App after the effective date of the revised policy constitutes acceptance.

---

## 11. Contact

For questions about this Privacy Policy, contact: **marco.pro.frei@gmail.com**
