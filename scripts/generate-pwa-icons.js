import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// High resolution SVG logo (Package Box + Live Stream Camera + Cambodian Cyan Theme)
const svgLogo = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#060D1D"/>
  <circle cx="256" cy="256" r="210" fill="#091830" stroke="#00F0FF" stroke-width="8"/>
  
  <!-- Package Box -->
  <path d="M256 120L380 180V320L256 380L132 320V180L256 120Z" fill="#0C2548" stroke="#00F0FF" stroke-width="12" stroke-linejoin="round"/>
  <path d="M256 120V380" stroke="#00F0FF" stroke-width="10"/>
  <path d="M132 180L256 240L380 180" stroke="#00F0FF" stroke-width="10"/>
  <path d="M194 150L318 210" stroke="#38BDF8" stroke-width="8" stroke-dasharray="10 10"/>
  
  <!-- Live Stream Glowing Indicator -->
  <circle cx="360" cy="140" r="28" fill="#EF4444"/>
  <circle cx="360" cy="140" r="18" fill="#F87171"/>
  
  <!-- Lock Symbol for Security -->
  <path d="M256 280C242.745 280 232 290.745 232 304V324C232 337.255 242.745 348 256 348C269.255 348 280 337.255 280 324V304C280 290.745 269.255 280 256 280Z" fill="#F59E0B"/>
  <path d="M242 280V264C242 256.268 248.268 250 256 250C263.732 250 270 256.268 270 264V280" stroke="#F59E0B" stroke-width="8" stroke-linecap="round"/>
</svg>
`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgLogo.trim());

async function generateIcons() {
  const svgBuf = Buffer.from(svgLogo);

  // 192x192
  await sharp(svgBuf)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 512x512
  await sharp(svgBuf)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Maskable 512x512 with safe zone padding
  await sharp(svgBuf)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: { r: 6, g: 13, b: 29, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // Apple touch icon 180x180
  await sharp(svgBuf)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('✅ Generated PWA icons in /public successfully!');
}

generateIcons().catch(console.error);
