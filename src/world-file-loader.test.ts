import { describe, it, expect } from 'vitest';
import { loadWorldFile, type WorldFile } from './world-file-loader';

// ---------------------------------------------------------------------------
// Helpers — build valid WORLD.md strings
// ---------------------------------------------------------------------------

const MINIMAL_WORLD = `---
title: Test World
starting_room:
  name: The Starting Chamber
  fixed_description: You stand in a dim stone room.
  exits:
    - north
    - east
---
# Tone & Style
A grim, medieval dungeon.
`;

const FULL_WORLD = `---
title: Full World
starting_room:
  name: The Grand Hall
  fixed_description: Banners hang from vaulted ceilings.
  exits:
    - north
    - south
    - east
    - west
  items:
    - name: Rusty Sword
      inspection_description: A blade pitted with age.
      room_blurb: A rusty sword leans against the wall.
      damage_min: 1
      damage_max: 4
      type: weapon
  monsters:
    - name: Cave Rat
      inspection_description: Beady red eyes gleam in the dark.
      room_blurb: A cave rat scurries in the corner.
      hp: 5
      max_hp: 5
      damage_min: 1
      damage_max: 2
  scenery:
    - name: Stone Pillar
      inspection_description: Carved with ancient runes.
      room_blurb: Thick stone pillars support the ceiling.
refusals:
  no_exit: There is no path that way.
  nothing_to_attack: There is nothing here to fight.
---
# Lore
A world of dark fantasy.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorldFileLoader', () => {
  describe('well-formed WORLD.md', () => {
    it('parses title and starting room from minimal frontmatter', () => {
      const result = loadWorldFile(MINIMAL_WORLD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const world = result.world;
      expect(world.title).toBe('Test World');
      expect(world.startingRoom.name).toBe('The Starting Chamber');
      expect(world.startingRoom.fixed_description).toBe('You stand in a dim stone room.');
      expect(world.startingRoom.exits).toEqual(['north', 'east']);
    });

    it('captures markdown body verbatim', () => {
      const result = loadWorldFile(MINIMAL_WORLD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.world.body).toContain('A grim, medieval dungeon.');
    });

    it('parses all optional fields from full frontmatter', () => {
      const result = loadWorldFile(FULL_WORLD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const world = result.world;
      expect(world.startingRoom.items).toHaveLength(1);
      expect(world.startingRoom.items![0].name).toBe('Rusty Sword');
      expect(world.startingRoom.monsters).toHaveLength(1);
      expect(world.startingRoom.monsters![0].name).toBe('Cave Rat');
      expect(world.startingRoom.scenery).toHaveLength(1);
      expect(world.startingRoom.scenery![0].name).toBe('Stone Pillar');
    });

    it('round-trips refusal overrides', () => {
      const result = loadWorldFile(FULL_WORLD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const world = result.world;
      expect(world.refusals).toBeDefined();
      expect(world.refusals!['no_exit']).toBe('There is no path that way.');
      expect(world.refusals!['nothing_to_attack']).toBe('There is nothing here to fight.');
    });

    it('optional fields are absent when not provided', () => {
      const result = loadWorldFile(MINIMAL_WORLD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const world = result.world;
      expect(world.startingRoom.items).toBeUndefined();
      expect(world.startingRoom.monsters).toBeUndefined();
      expect(world.startingRoom.scenery).toBeUndefined();
      expect(world.refusals).toBeUndefined();
    });
  });

  describe('required-field-missing failures', () => {
    it('errors when title is missing', () => {
      const md = `---
starting_room:
  name: Room
  fixed_description: Desc
  exits:
    - north
---
Body.
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/title/i);
    });

    it('errors when starting_room is missing', () => {
      const md = `---
title: World Without Room
---
Body.
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/starting_room/i);
    });

    it('errors when starting_room.name is missing', () => {
      const md = `---
title: World
starting_room:
  fixed_description: Desc
  exits:
    - north
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/starting_room\.name/i);
    });

    it('errors when starting_room.fixed_description is missing', () => {
      const md = `---
title: World
starting_room:
  name: Room
  exits:
    - north
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/starting_room\.fixed_description/i);
    });

    it('errors when starting_room.exits is missing', () => {
      const md = `---
title: World
starting_room:
  name: Room
  fixed_description: Desc
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/starting_room\.exits/i);
    });
  });

  describe('malformed YAML', () => {
    it('errors on invalid YAML frontmatter', () => {
      const md = `---
title: [unclosed bracket
starting_room: bad: nesting: here
---
Body.
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeTruthy();
    });

    it('errors when there is no frontmatter at all', () => {
      const result = loadWorldFile('No frontmatter here.');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/frontmatter/i);
    });

    it('errors when frontmatter is not a YAML object', () => {
      const md = `---
- just a list
- not an object
---
Body.
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeTruthy();
    });
  });

  describe('malformed exits list', () => {
    it('errors when exits contains an invalid direction', () => {
      const md = `---
title: World
starting_room:
  name: Room
  fixed_description: Desc
  exits:
    - north
    - diagonal
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/diagonal/i);
    });

    it('errors when exits is not an array', () => {
      const md = `---
title: World
starting_room:
  name: Room
  fixed_description: Desc
  exits: north
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/exits/i);
    });

    it('errors when exits is an empty array', () => {
      const md = `---
title: World
starting_room:
  name: Room
  fixed_description: Desc
  exits: []
---
`;
      const result = loadWorldFile(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/exits/i);
    });
  });
});
