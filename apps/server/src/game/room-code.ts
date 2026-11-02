import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@ttt/contracts';

export type RandomIndex = (maxExclusive: number) => number;

export function generateRoomCode(randomIndex: RandomIndex = randomInt): string {
  let code = '';

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const characterIndex = Math.floor(randomIndex(ROOM_CODE_ALPHABET.length));
    const character = ROOM_CODE_ALPHABET[characterIndex];

    if (character === undefined) {
      throw new Error('Room code generator returned an out-of-range index.');
    }

    code += character;
  }

  return code;
}
