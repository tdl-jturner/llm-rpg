import { describe, it, expect } from 'vitest';
import { directionToOffset, reciprocalDirection, Coords } from './grid-topology';

describe('directionToOffset', () => {
  it('north → z+1', () => {
    expect(directionToOffset('north')).toEqual<Coords>({ x: 0, y: 0, z: 1 });
  });

  it('south → z-1', () => {
    expect(directionToOffset('south')).toEqual<Coords>({ x: 0, y: 0, z: -1 });
  });

  it('east → x+1', () => {
    expect(directionToOffset('east')).toEqual<Coords>({ x: 1, y: 0, z: 0 });
  });

  it('west → x-1', () => {
    expect(directionToOffset('west')).toEqual<Coords>({ x: -1, y: 0, z: 0 });
  });

  it('up → y+1', () => {
    expect(directionToOffset('up')).toEqual<Coords>({ x: 0, y: 1, z: 0 });
  });

  it('down → y-1', () => {
    expect(directionToOffset('down')).toEqual<Coords>({ x: 0, y: -1, z: 0 });
  });
});

describe('reciprocalDirection', () => {
  it('north ↔ south', () => {
    expect(reciprocalDirection('north')).toBe('south');
    expect(reciprocalDirection('south')).toBe('north');
  });

  it('east ↔ west', () => {
    expect(reciprocalDirection('east')).toBe('west');
    expect(reciprocalDirection('west')).toBe('east');
  });

  it('up ↔ down', () => {
    expect(reciprocalDirection('up')).toBe('down');
    expect(reciprocalDirection('down')).toBe('up');
  });
});
