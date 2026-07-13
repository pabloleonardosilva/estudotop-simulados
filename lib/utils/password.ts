import { randomInt } from "crypto";
import { validatePassword } from "@/lib/auth/passwordPolicy";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%&*_-+=?";
const ALL = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

function pick(source: string) {
  return source[randomInt(source.length)];
}

function shuffle(characters: string[]) {
  for (let index = characters.length - 1; index > 0; index--) {
    const target = randomInt(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join("");
}

export function generateTemporaryPassword(length = 16): string {
  const safeLength = Math.max(12, length);
  for (let attempt = 0; attempt < 100; attempt++) {
    const characters = [pick(UPPERCASE), pick(LOWERCASE), pick(NUMBERS), pick(SYMBOLS)];
    while (characters.length < safeLength) characters.push(pick(ALL));
    const password = shuffle(characters);
    if (validatePassword(password).valid) return password;
  }
  throw new Error("Não foi possível gerar uma senha temporária segura.");
}
