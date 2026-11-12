// Which studio this is. The web release build (tools/release-web.sh) checks that the
// newest heading in CHANGELOG.md is this version, so the two never drift apart.
export const VERSION = '2.0.0-experimental.1';
export const RELEASED = '2026-11-12';
// "experimental" until the file format and the studio settle: say so wherever the
// version shows, so nobody mistakes it for a finished product.
export const CHANNEL = 'experimental';
export const FEEDBACK = {
  forum: 'https://curioustrove.itch.io/octoshaper/community',
  email: 'mailto:contact@curioustrove.com?subject=OctoShaper%20Studio%20feedback',
};
