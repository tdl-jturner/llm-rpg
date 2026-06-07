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

export interface MonsterBlurb {
  room_blurb: string;
}

export interface AssembleOptions {
  items?: ItemBlurb[];
  scenery?: SceneryBlurb[];
  monsters?: MonsterBlurb[];
  exits?: string[];
}

/**
 * Assembles the full LOOK output for a room.
 *
 * Output order:
 *   1. fixed_description
 *   2. Each item's blurb (authored if disturbed=false, template if disturbed=true)
 *   3. Each monster's room_blurb (only while alive — callers filter dead monsters)
 *   4. Each scenery item's room_blurb (in author-supplied order)
 *
 * Scenery blurbs are permanent — they never disappear.
 * Items disappear from LOOK once picked up (they move to inventory, not room).
 * Monsters disappear from LOOK once dead (location changes to "dead:<id>").
 */
export function assembleBlurb(room: RoomData, options: AssembleOptions = {}): string {
  const { items = [], scenery = [], monsters = [], exits } = options;

  const parts: string[] = [room.fixed_description];

  for (const item of items) {
    if (item.disturbed) {
      parts.push(`A ${item.name} lies on the ground here.`);
    } else {
      if (item.room_blurb) {
        parts.push(item.room_blurb);
      }
    }
  }

  for (const monster of monsters) {
    if (monster.room_blurb) {
      parts.push(monster.room_blurb);
    }
  }

  for (const s of scenery) {
    if (s.room_blurb) {
      parts.push(s.room_blurb);
    }
  }

  if (exits && exits.length > 0) {
    parts.push(`Exits: ${exits.join(', ')}`);
  }

  return parts.join('\n');
}
