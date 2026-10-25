import { colorOf } from '../data/colors';

/** A small pixel icon for each bot, used only in the live chat.
 * The pattern is "random" but fixed per bot: a 5×5 mirrored grid seeded from the bot's id, in its node colour. */
function cells(id: string): boolean[] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out: boolean[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0;
      out[y * 5 + x] = (h & 1) === 1;
    }
  for (let y = 0; y < 5; y++) {
    out[y * 5 + 3] = out[y * 5 + 1];
    out[y * 5 + 4] = out[y * 5 + 0];
  }
  if (!out.some(Boolean)) out[12] = true;
  return out;
}

export default function BotIcon({ id, size = 20 }: { id: string; size?: number }) {
  const c = colorOf(id);
  return (
    <svg
      className="bot-icon"
      width={size}
      height={size}
      viewBox="0 0 5 5"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {cells(id).map((on, i) =>
        on ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" fill={c} /> : null,
      )}
    </svg>
  );
}
