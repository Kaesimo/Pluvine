# pluvine-bin — AUR package (prepared, not published yet)

This directory is the complete AUR package for Pluvine, ready to push to
`ssh://aur@aur.archlinux.org/pluvine-bin.git` once an AUR account with an
SSH key exists. It follows the AUR submission rules: `-bin` name for a
prebuilt package, `# Maintainer:` comment, `license` field, `.SRCINFO`
generated from the PKGBUILD, real sha256sums, sources from the public
GitHub release. The package name and the AUR were checked free.

Publish steps (when the AUR accepts the account):

1. Create the account at https://aur.archlinux.org/register
   (use a non-personal email — the AUR shows it on the public profile).
2. Add the SSH public key at https://aur.archlinux.org/account
   (the private key lives at ~/.ssh/aur on this machine).
3. Put these three files (PKGBUILD, .SRCINFO, pluvine.desktop) in a fresh
   git repository, then:

   ```bash
   git init -b main
   git add PKGBUILD .SRCINFO pluvine.desktop
   git commit -m "pluvine-bin <pkgver>-<pkgrel>"
   git remote add aur ssh://aur@aur.archlinux.org/pluvine-bin.git
   git push aur main
   ```

After any PKGBUILD edit, regenerate `.SRCINFO` with
`makepkg --printsrcinfo > .SRCINFO` and commit both files together.
The commit identity for the AUR repo must be the noreply address
(`kaesimo@users.noreply.github.com`), never a personal email.
