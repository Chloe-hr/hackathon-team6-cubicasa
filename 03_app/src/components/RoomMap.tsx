import { useEffect, useRef, useState } from "react";
import { roomName } from "../api";

const BACKGROUND = 0xffffff;

// A room map drawn on a canvas. When a room type is chosen in the room key, every other room fades,
// and the caption gives the chosen room's share of all room pixels in this plan.
export function RoomMap({ src, colours, focus, label }: {
  src: string;
  colours: Record<string, string>;
  focus: string | null;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState<ImageData | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const context = canvas.current?.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      canvas.current!.width = image.width;
      canvas.current!.height = image.height;
      context.drawImage(image, 0, 0);
      setPixels(context.getImageData(0, 0, image.width, image.height));
    };
    image.src = src;
  }, [src]);

  const focusKey = focus ? parseInt(colours[focus].slice(1), 16) : null;
  let share: number | null = null;
  if (pixels && focusKey !== null) {
    const data = pixels.data;
    let rooms = 0;
    let chosen = 0;
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (key === BACKGROUND) continue;
      rooms++;
      if (key === focusKey) chosen++;
    }
    share = rooms ? chosen / rooms : 0;
  }

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !pixels) return;
    if (focusKey === null) return context.putImageData(pixels, 0, 0);
    const faded = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
    const data = faded.data;
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (key === focusKey || key === BACKGROUND) continue;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] + (255 - data[i + c]) * 0.86);
    }
    context.putImageData(faded, 0, 0);
  }, [pixels, focusKey]);

  return (
    <figure className="room-map">
      <canvas ref={canvas} width={128} height={128} role="img" aria-label={label} />
      {focus && share !== null && (
        <figcaption>
          {roomName(focus)} <b>{share > 0 ? `${Math.max(1, Math.round(share * 100))}%` : "none"}</b>
        </figcaption>
      )}
    </figure>
  );
}
