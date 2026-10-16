import type { KetikSessionConfig } from "@trainers/types";
import { inferKetikIdentityGender } from "@trainers/types";

/**
 * Portrait URL for the consumer, or undefined when the gender is unknown so the
 * header shows the initial instead of guessing a face of the wrong gender.
 */
export function getKetikConsumerAvatarUrl(
  identity: KetikSessionConfig["identity"],
): string | undefined {
  const gender = identity.gender ?? inferKetikIdentityGender(identity.name);
  if (!gender) return undefined;
  const seed = `${identity.name}|${identity.phone}|${identity.city}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const folder = gender === "male" ? "men" : "women";
  return `https://randomuser.me/api/portraits/${folder}/${hash % 100}.jpg`;
}
