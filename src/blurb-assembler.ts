export interface RoomData {
  fixed_description: string;
}

export interface SceneryBlurb {
  room_blurb: string;
}

export interface AssembleOptions {
  scenery?: SceneryBlurb[];
}

/**
 * Assembles the full LOOK output for a room.
 *
 * Output order:
 *   1. fixed_description
 *   2. Each scenery item's room_blurb (in author-supplied order)
 *
 * Scenery blurbs are permanent — they never disappear.
 */
export function assembleBlurb(room: RoomData, options: AssembleOptions = {}): string {
  const { scenery = [] } = options;

  const parts: string[] = [room.fixed_description];

  for (const s of scenery) {
    if (s.room_blurb) {
      parts.push(s.room_blurb);
    }
  }

  return parts.join('\n');
}
