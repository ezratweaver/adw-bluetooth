# AUR Release Procedure

This assumes you have been given access to the AUR repo and permission to perform a release to the AUR

## Steps

### 1. Tag the release in the main repo

```bash
git tag -a 1.0.0 -m "v1.0.0"
git push origin 1.0.0
```

### 2. Get the tarball checksum

```bash
curl -L "https://github.com/ezratweaver/adw-bluetooth/archive/refs/tags/1.0.0.tar.gz" | b2sum
```

### 3. Prepare the AUR PKGBUILD

```bash
cd ../adw-bluetooth-aur

# Copy PKGBUILD from main repo
cp ../adw-bluetooth/PKGBUILD ./

# Update version, b2sums, arch, depends, etc.
nvim PKGBUILD
```

### 4. Build and validate in an Arch container

```bash
podman run -it --rm \
  -v .:/work \
  docker.io/archlinux/archlinux:base-devel \
  bash -c "
    pacman -Sy --noconfirm
    cp -r /work /tmp/repo
    useradd -m build
    echo 'build ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
    chown -R build:build /tmp/repo
    su build -c '
      cd /tmp/repo
      makepkg -s --noconfirm
      makepkg --printsrcinfo > .SRCINFO
    '
    cp /tmp/repo/.SRCINFO /work/
  "
```

### 5. Commit and push outside the container

```bash
git add -A
git commit -m "release 1.0.0"
git push
```

### 6. Create official release on GitHub

Publish a new release for GitHub with a changelog.
