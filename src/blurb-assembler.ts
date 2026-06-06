export interface RoomData {
  fixed_description: string;
}

export interface SceneryBlurb {
  room_blurb: string;
}

export interface ItemBlurb {
  name: string;
  room_blurb: string;
  /** If false, use the authored room_blurb. If true, use the deterministic template. */
  disturbed: boolean;
}

export interface AssembleOptions {
  items?: ItemBlurb[];
  scenery?: SceneryBlurb[];
}

/**
 * Assembles the full LOOK output for a room.
 *
 * Output order:
 *   1. fixed_description
 *   2. Each item's blurb (authored if disturbed=false, template if disturbed=true)
 *   3. Each scenery item's room_blurb (in author-supplied order)
 *
 * Scenery blurbs are permanent — they never disappear.
 * Items disappear from LOOK once picked up (they move to inventory, not room).
 */
export function assembleBlurb(room: RoomData, options: AssembleOptions = {}): string {
  const { items = [], scenery = [] } = options;

  const parts: string[] = [room.fixed_description];

  for (const item of items) {
    if (item.disturbed) {
      parts.push(`A ${item.name} lies on the floor here.`);
    } else {
      if (item.room_blurb) {
        parts.push(item.room_blurb);
      }
    }
  }

  for (const s of scenery) {
    if (s.room_blurb) {
      parts.push(s.room_blurb);
    }
  }

  return parts.join('\n');
}
