export interface RoomData {
  fixed_description: string;
}

export function assembleBlurb(room: RoomData): string {
  return room.fixed_description;
}
