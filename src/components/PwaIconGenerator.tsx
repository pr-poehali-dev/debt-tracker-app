import { useEffect } from "react";

const ICON_URL = "https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/ae21a531-10ac-449e-ad8f-29f4fd92f87a.jpg";
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const STORAGE_KEY = "pwa-icons-generated-v7";

function generateIcon(src: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no ctx"));

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Rounded rect clip
      const r = size * 0.22;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("no blob")), "image/png");
    };
    img.onerror = reject;
    img.src = src;
  });
}

export default function PwaIconGenerator() {
  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    async function run() {
      try {
        const cache = await caches.open("debtflow-v1");
        for (const size of SIZES) {
          const key = `/icons/icon-${size}.png`;
          // Перегенерируем иконки под новый логотип
          const blob = await generateIcon(ICON_URL, size);
          const response = new Response(blob, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" } });
          await cache.put(key, response);
        }
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // silent fail — иконки необязательны
      }
    }

    run();
  }, []);

  return null;
}